import type { ChallengeStore } from '../domain/ports.ts';

/** Ключи авторизации HTTP-01 в памяти: живут, пока центр сертификации проверяет домены. */
export var defineChallengeStore = (): ChallengeStore => {
  const answers = new Map<string, string>();
  return {
    publish: (token, keyAuthorization) =>
      void answers.set(token, keyAuthorization),
    withdraw: (token) => void answers.delete(token),
    answer: (token) => answers.get(token) ?? null,
  };
};
