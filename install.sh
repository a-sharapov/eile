#!/usr/bin/env bash
# Установщик Eile: скачивает бинарник `cms` под эту систему из релиза на GitHub, проверяет контрольную
# сумму и кладёт в ~/.local/bin (под root — в /usr/local/bin), а рядом — второе имя `eile`.
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
ALIAS=eile

if [ -t 2 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m' DIM=$'\033[2m' GREEN=$'\033[32m' YELLOW=$'\033[33m' RED=$'\033[31m' RESET=$'\033[0m'
else
  BOLD='' DIM='' GREEN='' YELLOW='' RED='' RESET=''
fi

# Язык сообщений — по локали, как у cms: русская — по-русски, любая другая — по-английски.
case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in
  ru*) RU=1 ;;
  *) RU='' ;;
esac

# t 'по-русски' 'in English'
t() { if [ -n "$RU" ]; then printf '%s' "$1"; else printf '%s' "$2"; fi; }

info() { printf '%s→%s %s\n' "$DIM" "$RESET" "$*" >&2; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
fail() {
  printf '%s%s:%s %s\n' "$RED" "$(t ошибка error)" "$RESET" "$*" >&2
  exit 1
}

# Цель сборки: linux-x64, linux-arm64-musl, darwin-arm64…
detect_target() {
  local os arch libc=''
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    MINGW* | MSYS* | CYGWIN*) fail "$(t 'Windows этот установщик не поддерживает: запустите его в WSL' 'this installer does not support Windows: run it in WSL')" ;;
    *) fail "$(t "система $(uname -s) не поддерживается: нужны Linux или macOS" "$(uname -s) is not supported: Linux or macOS only")" ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) fail "$(t "процессор $(uname -m) не поддерживается: нужны x64 или arm64" "the $(uname -m) processor is not supported: x64 or arm64 only")" ;;
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
    fail "$(t 'нужен curl или wget' 'curl or wget is needed')"
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    fail "$(t 'нужна sha256sum или shasum, чтобы проверить скачанный файл' 'sha256sum or shasum is needed to check the download')"
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
  printf '\n# Eile: %s\n%s\n' "$(t 'команды cms и eile' 'the cms and eile commands')" "$line" >>"$rc"
  printf '%s' "$rc"
}

# Второе имя — ссылка на cms в том же каталоге: cms update заменит файл, а ссылка останется. Чужой eile не
# трогаем.
link_alias() {
  local link=$1/$ALIAS
  if [ ! -e "$link" ] && [ ! -L "$link" ]; then
    ln -s "$BIN" "$link"
  elif [ "$(readlink "$link" 2>/dev/null || true)" != "$BIN" ]; then
    warn "$(t "$link уже есть и это не ссылка на $BIN: второе имя $ALIAS не создано" "$link exists and is not a link to $BIN: the second name $ALIAS was not created")"
    return 1
  fi
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
    fail "$(t 'установщик взят не из релиза: укажите репозиторий, например CMS_REPO=owner/name' 'this installer is not from a release: set the repository, e.g. CMS_REPO=owner/name')"
  elif [ "$version" = latest ]; then
    base="https://github.com/$REPO/releases/latest/download"
  else
    base="https://github.com/$REPO/releases/download/$version"
  fi

  local target file dir tmp
  target=$(detect_target)
  file="$BIN-$target.gz"
  case "$target" in
    *-musl) musl_ready || fail "$(t 'на musl cms нужны libgcc и libstdc++: apk add libgcc libstdc++' 'on musl, cms needs libgcc and libstdc++: apk add libgcc libstdc++')" ;;
  esac
  dir=$(install_dir)
  tmp=$(mktemp -d)
  # shellcheck disable=SC2064 # путь нужен сейчас, а не при выходе
  trap "rm -rf '$tmp'" EXIT

  info "$(t скачиваю downloading) $file ($version)"
  download "$base/$file" "$tmp/$file" || fail "$(t 'не скачался' 'download failed:') $base/$file"
  download "$base/SHA256SUMS" "$tmp/SHA256SUMS" || fail "$(t 'не скачался' 'download failed:') $base/SHA256SUMS"

  local expected actual
  expected=$(awk -v f="$file" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")
  [ -n "$expected" ] || fail "$(t "в SHA256SUMS нет $file" "SHA256SUMS has no $file")"
  actual=$(sha256 "$tmp/$file")
  [ "$expected" = "$actual" ] || fail "$(t "контрольная сумма $file не совпала: файл повреждён или подменён" "the checksum of $file does not match: the file is damaged or replaced")"

  gzip -dc "$tmp/$file" >"$tmp/$BIN"
  chmod 755 "$tmp/$BIN"
  # Запустить до замены: старая glibc или чужая платформа видны сразу, установленный cms цел.
  local about
  about=$("$tmp/$BIN" version 2>&1) || fail "$(t 'скачанный cms не запускается на этой системе' 'the downloaded cms does not run on this system'): ${about%%$'\n'*}"

  mkdir -p "$dir" 2>/dev/null || fail "$(t "не создать $dir: задайте CMS_INSTALL_DIR или запустите через sudo" "cannot create $dir: set CMS_INSTALL_DIR or run with sudo")"
  [ -w "$dir" ] || fail "$(t "нет прав на запись в $dir: задайте CMS_INSTALL_DIR или запустите через sudo" "no write access to $dir: set CMS_INSTALL_DIR or run with sudo")"
  # Через временный файл в том же каталоге: замена атомарна, работающий сервер продолжит на старом файле.
  cp "$tmp/$BIN" "$dir/.$BIN.new.$$"
  mv -f "$dir/.$BIN.new.$$" "$dir/$BIN"
  local names=("$BIN") also=''
  if link_alias "$dir"; then
    names+=("$ALIAS")
    also=$(t ", второе имя — $ALIAS" ", also as $ALIAS")
  fi

  printf '%s✓%s %s%s%s %s: %s%s\n' "$GREEN" "$RESET" "$BOLD" "$about" "$RESET" "$(t установлен installed)" "$dir/$BIN" "$also" >&2

  local name found
  for name in "${names[@]}"; do
    found=$(command -v "$name" 2>/dev/null || true)
    if [ -n "$found" ] && [ "$found" != "$dir/$name" ]; then
      warn "$(t "в PATH раньше стоит другой $name: $found" "another $name comes first in PATH: $found")"
    fi
  done
  if ! on_path "$dir"; then
    if [ "${CMS_NO_MODIFY_PATH:-}" = 1 ]; then
      warn "$(t "$dir нет в PATH: добавьте его сами" "$dir is not in PATH: add it yourself")"
    else
      local rc
      rc=$(add_to_path "$dir")
      info "$(t "добавил $dir в PATH ($rc) — откройте новый терминал" "added $dir to PATH ($rc): open a new terminal")"
    fi
  fi

  if [ -n "$RU" ]; then
    cat >&2 <<EOF

Дальше:
  ${BOLD}$BIN new blog --db site.db${RESET}   готовый сайт: blog, portfolio, company, showcase, shop
  ${BOLD}$BIN --db site.db${RESET}            сайт на http://localhost:8080, менеджер — /manager
  ${BOLD}$BIN help${RESET}                    все команды

Обновить — запустить установщик ещё раз; работающий сервер перезапустите.
EOF
  else
    cat >&2 <<EOF

Next:
  ${BOLD}$BIN new blog --db site.db${RESET}   a ready-made site: blog, portfolio, company, showcase, shop
  ${BOLD}$BIN --db site.db${RESET}            the site at http://localhost:8080, the manager at /manager
  ${BOLD}$BIN help${RESET}                    all commands

To update, run the installer again and restart a running server.
EOF
  fi
}

main "$@"
