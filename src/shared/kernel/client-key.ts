/**
 * Ключ посетителя для лимитов в памяти процесса: HMAC-SHA256 его адреса с солью, случайной на каждый вызов
 * фабрики. Лимит считает ключ, а сам IP в памяти не лежит; соль нигде не хранится, поэтому после перезапуска
 * прежние ключи ничего не значат.
 */
export var defineClientKey = (): ((address: string) => string) =>
  (
    (salt) => (address) =>
      new Bun.CryptoHasher('sha256', salt).update(address).digest('base64url')
  )(crypto.getRandomValues(new Uint8Array(32)));
