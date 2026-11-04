// Решатель задачи защиты форм (ADR 0053): найти число n от 0 до max, при котором SHA-256(соль + n) равен
// хэшу задачи. Свой SHA-256 на один блок: crypto.subtle есть только в защищённом контексте и на коротком
// входе медленнее из-за Promise на каждый хэш. Этот текст стоит и в скрипте форм, и в его воркере.
const PROOF_K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const PROOF_IV = new Int32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);

// Длинные соли и числа не бывают: соль — 16 знаков base64url, число — до 7 цифр, всё в один блок.
const PROOF_MAX_INPUT = 55;

/**
 * Ищет n в [from, to): SHA-256(salt + n) === challenge (64 знака hex). Ответ — n или -1. Синхронно: в воркере —
 * весь диапазон сразу, на странице — кусками между кадрами.
 */
// biome-ignore lint/correctness/noUnusedVariables: зовут скрипт форм и воркер, с которыми этот текст склеен
const proofSearch = (salt, challenge, from, to) => {
  const target = new Int32Array(8);
  for (let i = 0; i < 8; i++) {
    target[i] = Number.parseInt(challenge.slice(i * 8, i * 8 + 8), 16) | 0;
  }
  const block = new Uint8Array(64);
  for (let i = 0; i < salt.length; i++) block[i] = salt.charCodeAt(i) & 0xff;
  const w = new Int32Array(64);
  for (let n = from; n < to; n++) {
    let length = salt.length;
    let scale = 1;
    while (scale * 10 <= n) scale *= 10;
    for (let rest = n; scale >= 1; scale = Math.floor(scale / 10)) {
      const digit = Math.floor(rest / scale);
      block[length++] = 48 + digit;
      rest -= digit * scale;
    }
    if (length > PROOF_MAX_INPUT) return -1;
    block[length] = 0x80;
    block.fill(0, length + 1, 62);
    block[62] = (length * 8) >>> 8;
    block[63] = (length * 8) & 0xff;
    for (let i = 0; i < 16; i++) {
      w[i] =
        (block[i * 4] << 24) |
        (block[i * 4 + 1] << 16) |
        (block[i * 4 + 2] << 8) |
        block[i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 =
        ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = PROOF_IV[0];
    let b = PROOF_IV[1];
    let c = PROOF_IV[2];
    let d = PROOF_IV[3];
    let e = PROOF_IV[4];
    let f = PROOF_IV[5];
    let g = PROOF_IV[6];
    let h = PROOF_IV[7];
    for (let i = 0; i < 64; i++) {
      const S1 =
        ((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + PROOF_K[i] + w[i]) | 0;
      const S0 =
        ((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    if (
      ((PROOF_IV[0] + a) | 0) === target[0] &&
      ((PROOF_IV[1] + b) | 0) === target[1] &&
      ((PROOF_IV[2] + c) | 0) === target[2] &&
      ((PROOF_IV[3] + d) | 0) === target[3] &&
      ((PROOF_IV[4] + e) | 0) === target[4] &&
      ((PROOF_IV[5] + f) | 0) === target[5] &&
      ((PROOF_IV[6] + g) | 0) === target[6] &&
      ((PROOF_IV[7] + h) | 0) === target[7]
    ) {
      return n;
    }
  }
  return -1;
};

/** Задача из атрибута формы: `SHA-256.соль.max.срок.хэш.подпись`; чужой алгоритм или вид — null. */
// biome-ignore lint/correctness/noUnusedVariables: зовёт скрипт форм, с которым этот текст склеен
const proofTask = (text) => {
  const parts = String(text ?? '').split('.');
  return parts.length === 6 &&
    parts[0] === 'SHA-256' &&
    /^[A-Za-z0-9_-]{1,32}$/.test(parts[1]) &&
    /^\d{1,7}$/.test(parts[2]) &&
    /^[0-9a-f]{64}$/.test(parts[4])
    ? { text, salt: parts[1], max: Number(parts[2]), challenge: parts[4] }
    : null;
};
