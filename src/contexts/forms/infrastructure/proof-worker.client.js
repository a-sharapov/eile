// Воркер решателя задачи защиты форм: proofSearch приходит из начала файла — enhance.ts склеивает их.
self.onmessage = (event) => {
  const { salt, challenge, max } = event.data;
  self.postMessage(proofSearch(salt, challenge, 0, max + 1));
};
