// Скрытый ввод пароля в терминале: символы не отображаются, Backspace стирает, Ctrl+C отменяет.

export type Typing = {
  readonly value: string;
  readonly done: 'enter' | 'cancel' | null;
};

/** Один введённый символ: чистый шаг, его проверяют тесты. */
export var typeKey = (state: Typing, key: string): Typing =>
  state.done !== null
    ? state
    : key === '\r' || key === '\n' || key === '\u0004'
      ? { ...state, done: 'enter' }
      : key === '\u0003'
        ? { ...state, done: 'cancel' }
        : key === '\u007f' || key === '\b'
          ? { ...state, value: [...state.value].slice(0, -1).join('') }
          : key < ' '
            ? state
            : { ...state, value: state.value + key };

export var promptHidden = (question: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let state: Typing = { value: '', done: null };
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      void (state.done === 'enter'
        ? resolve(state.value)
        : reject(Object.assign(new Error('Отменено.'), { cli: true })));
    };
    const onData = (chunk: string) => {
      state = [...chunk].reduce(typeKey, state);
      void (state.done && finish());
    };
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });
