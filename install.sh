#!/usr/bin/env bash
# Установщик Eile: скачивает бинарник `cms` под эту систему из релиза на GitHub, проверяет контрольную
# сумму и кладёт в ~/.local/bin (под root — в /usr/local/bin).
#
#   curl -fsSL https://github.com/__REPO__/releases/latest/download/install.sh | bash
#   curl -fsSL https://github.com/__REPO__/releases/latest/download/install.sh | bash -s -- v0.2.0
#
# Переменные окружения:
#   CMS_VERSION          тег релиза, например v0.2.0; по умолчанию — последний
#   CMS_INSTALL_DIR      куда положить cms
#   CMS_NO_MODIFY_PATH   1 — не дописывать каталог в PATH в файлах оболочки
#   CMS_REPO             owner/name репозитория на GitHub; релиз вписывает свой
#   CMS_DOWNLOAD_URL     свой адрес файлов релиза (зеркало, file:// для проверки)
#
# Всё — в функциях, вызов — в последней строке: оборванная загрузка `curl | bash` не выполнит полскрипта.
set -euo pipefail

REPO="${CMS_REPO:-__REPO__}"
BIN=cms

if [ -t 2 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m' DIM=$'\033[2m' GREEN=$'\033[32m' YELLOW=$'\033[33m' RED=$'\033[31m' RESET=$'\033[0m'
else
  BOLD='' DIM='' GREEN='' YELLOW='' RED='' RESET=''
fi

info() { printf '%s→%s %s\n' "$DIM" "$RESET" "$*" >&2; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
fail() {
  printf '%sошибка:%s %s\n' "$RED" "$RESET" "$*" >&2
  exit 1
}

# Цель сборки: linux-x64, linux-arm64-musl, darwin-arm64…
detect_target() {
  local os arch libc=''
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    MINGW* | MSYS* | CYGWIN*) fail 'Windows этот установщик не поддерживает: запустите его в WSL' ;;
    *) fail "система $(uname -s) не поддерживается: нужны Linux или macOS" ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) fail "процессор $(uname -m) не поддерживается: нужны x64 или arm64" ;;
  esac
  # Терминал под Rosetta на Mac с Apple Silicon: родной бинарник быстрее.
  if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
    arch=arm64
  fi
  # Alpine и другие системы на musl. Без конвейера с grep -q: при pipefail он даёт ложный отказ.
  if [ "$os" = linux ]; then
    case "$(ldd --version 2>&1 || true)" in
      *musl*) libc=-musl ;;
    esac
    if [ -f /etc/alpine-release ]; then libc=-musl; fi
  fi
  printf '%s-%s%s' "$os" "$arch" "$libc"
}

# Сборке Bun для musl нужны libgcc и libstdc++; в голом Alpine их нет.
musl_ready() {
  local lib
  for lib in /usr/lib/libstdc++.so.6 /lib/libstdc++.so.6 /usr/local/lib/libstdc++.so.6; do
    if [ -e "$lib" ]; then return 0; fi
  done
  return 1
}

download() {
  local url=$1 out=$2
  if command -v curl >/dev/null 2>&1; then
    local progress=(--silent --show-error)
    if [ -t 2 ]; then progress=(--progress-bar); fi
    curl --fail --location --proto '=https,file' --retry 3 "${progress[@]}" --output "$out" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --output-document="$out" "$url"
  else
    fail 'нужен curl или wget'
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    fail 'нужна sha256sum или shasum, чтобы проверить скачанный файл'
  fi
}

install_dir() {
  if [ -n "${CMS_INSTALL_DIR:-}" ]; then
    printf '%s' "$CMS_INSTALL_DIR"
  elif [ "$(id -u)" = 0 ]; then
    printf '%s' /usr/local/bin
  else
    printf '%s' "$HOME/.local/bin"
  fi
}

on_path() {
  case ":$PATH:" in
    *":$1:"*) return 0 ;;
    *) return 1 ;;
  esac
}

# Дописать каталог в PATH в файле оболочки — один раз. Ответ — файл, если дописали.
add_to_path() {
  local dir=$1 shown rc line
  shown=${dir/#$HOME/\$HOME}
  case "$(basename "${SHELL:-sh}")" in
    fish)
      rc=$HOME/.config/fish/config.fish
      line="fish_add_path $shown"
      ;;
    zsh)
      rc=${ZDOTDIR:-$HOME}/.zshrc
      line="export PATH=\"$shown:\$PATH\""
      ;;
    bash)
      rc=$HOME/.bashrc
      if [ "$(uname -s)" = Darwin ]; then rc=$HOME/.bash_profile; fi
      line="export PATH=\"$shown:\$PATH\""
      ;;
    *)
      rc=$HOME/.profile
      line="export PATH=\"$shown:\$PATH\""
      ;;
  esac
  if [ -f "$rc" ] && grep -qF -- "$line" "$rc"; then
    printf '%s' "$rc"
    return 0
  fi
  mkdir -p "$(dirname "$rc")"
  printf '\n# Eile: команда cms\n%s\n' "$line" >>"$rc"
  printf '%s' "$rc"
}

main() {
  local version=${1:-${CMS_VERSION:-latest}}
  case "$version" in
    latest | v*) ;;
    *) version=v$version ;;
  esac

  local base
  if [ -n "${CMS_DOWNLOAD_URL:-}" ]; then
    base=${CMS_DOWNLOAD_URL%/}
  elif [[ "$REPO" != */* ]]; then
    # Релиз вписывает сюда owner/name вместо метки; сравнивать с самой меткой нельзя — её заменит и здесь.
    fail 'установщик взят не из релиза: укажите репозиторий, например CMS_REPO=owner/name'
  elif [ "$version" = latest ]; then
    base="https://github.com/$REPO/releases/latest/download"
  else
    base="https://github.com/$REPO/releases/download/$version"
  fi

  local target file dir tmp
  target=$(detect_target)
  file="$BIN-$target.gz"
  case "$target" in
    *-musl) musl_ready || fail 'на musl cms нужны libgcc и libstdc++: apk add libgcc libstdc++' ;;
  esac
  dir=$(install_dir)
  tmp=$(mktemp -d)
  # shellcheck disable=SC2064 # путь нужен сейчас, а не при выходе
  trap "rm -rf '$tmp'" EXIT

  info "скачиваю $file ($version)"
  download "$base/$file" "$tmp/$file" || fail "не скачался $base/$file"
  download "$base/SHA256SUMS" "$tmp/SHA256SUMS" || fail "не скачался $base/SHA256SUMS"

  local expected actual
  expected=$(awk -v f="$file" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")
  [ -n "$expected" ] || fail "в SHA256SUMS нет $file"
  actual=$(sha256 "$tmp/$file")
  [ "$expected" = "$actual" ] || fail "контрольная сумма $file не совпала: файл повреждён или подменён"

  gzip -dc "$tmp/$file" >"$tmp/$BIN"
  chmod 755 "$tmp/$BIN"
  # Запустить до замены: старая glibc или чужая платформа видны сразу, установленный cms цел.
  local about
  about=$("$tmp/$BIN" version 2>&1) || fail "скачанный cms не запускается на этой системе: ${about%%$'\n'*}"

  mkdir -p "$dir" 2>/dev/null || fail "не создать $dir: задайте CMS_INSTALL_DIR или запустите через sudo"
  [ -w "$dir" ] || fail "нет прав на запись в $dir: задайте CMS_INSTALL_DIR или запустите через sudo"
  # Через временный файл в том же каталоге: замена атомарна, работающий сервер продолжит на старом файле.
  cp "$tmp/$BIN" "$dir/.$BIN.new.$$"
  mv -f "$dir/.$BIN.new.$$" "$dir/$BIN"

  printf '%s✓%s %s%s%s установлен: %s\n' "$GREEN" "$RESET" "$BOLD" "$about" "$RESET" "$dir/$BIN" >&2

  local found
  found=$(command -v "$BIN" 2>/dev/null || true)
  if [ -n "$found" ] && [ "$found" != "$dir/$BIN" ]; then
    warn "в PATH раньше стоит другой $BIN: $found"
  fi
  if ! on_path "$dir"; then
    if [ "${CMS_NO_MODIFY_PATH:-}" = 1 ]; then
      warn "$dir нет в PATH: добавьте его сами"
    else
      local rc
      rc=$(add_to_path "$dir")
      info "добавил $dir в PATH ($rc) — откройте новый терминал"
    fi
  fi

  cat >&2 <<EOF

Дальше:
  ${BOLD}$BIN new blog --db site.db${RESET}   готовый сайт: blog, portfolio, company, showcase, shop
  ${BOLD}$BIN --db site.db${RESET}            сайт на http://localhost:8080, менеджер — /manager
  ${BOLD}$BIN help${RESET}                    все команды

Обновить — запустить установщик ещё раз; работающий сервер перезапустите.
EOF
}

main "$@"
