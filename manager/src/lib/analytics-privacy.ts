// Образец абзаца политики конфиденциальности об аналитике клиентского пути (ADR 0072, «Правовая оценка»): на
// языках сайтов, а не менеджера, поэтому не в словарях. Срок хранения подставляется из настройки; в квадратных
// скобках — то, что владелец сайта вписывает сам. Это не юридическая консультация: формулировку проверяет он.
// Есть у сайта переход `/_cms/go/…` (и в архиве: он тоже работает) — фраза о несвязанности визита неверна, и на
// её месте — фраза о переходе (ADR 0072, «Правовая оценка перехода»).

/** Что подставить в образец: срок хранения в месяцах (0 — бессрочно) и есть ли у сайта переходы. */
export type PrivacyOptions = {
  readonly months: number;
  readonly links: boolean;
};

export type PrivacySample = {
  readonly language: string;
  readonly lang: string;
  readonly text: (options: PrivacyOptions) => string;
};

const _plural = (lang: string, n: number) =>
  new Intl.PluralRules(lang).select(n);

// Срок — с пробелом впереди, «пока не попросят» — придаточное, перед ним запятая (в немецком и русском).
const _DE = (months: number): string =>
  months > 0
    ? ` bis zu ${months} ${_plural('de', months) === 'one' ? 'Monat' : 'Monate'} nach dem letzten Ereignis`
    : ', bis Sie die Löschung verlangen';

const _EN = (months: number): string =>
  months > 0
    ? ` for up to ${months} ${_plural('en', months) === 'one' ? 'month' : 'months'} after the last event`
    : ' until you ask us to delete them';

// «до N месяца» — родительный падеж: 1, 21 — «месяца», остальное — «месяцев».
const _RU = (months: number): string =>
  months > 0
    ? ` до ${months} ${months % 10 === 1 && months % 100 !== 11 ? 'месяца' : 'месяцев'} после последнего события`
    : ', пока вы не попросите их удалить';

const _DE_VISIT = {
  apart:
    'Ihr Besuch auf dieser Website wird damit nicht verknüpft; auf Ihrem Endgerät wird dafür nichts gespeichert oder ausgelesen.',
  links:
    'Folgen Sie auf unserer Website einem Link zu [unserem Telegram-Bot / unserem Shop], gibt unser Server im Link mit, woher Sie an diesem Tag zu uns gekommen sind (Kampagnenparameter oder die verweisende Website, als Kürzel). Weitere Daten Ihres Besuchs geben wir nicht weiter, und auf Ihrem Endgerät wird dafür nichts gespeichert oder ausgelesen.',
};

const _EN_VISIT = {
  apart:
    'Your visit to this website is not linked to it; nothing is stored on or read from your device for this purpose.',
  links:
    'If you follow a link on our website to [our Telegram bot / our shop], our server adds to the link where you came to us from that day (campaign parameters or the referring website, as a short code). We pass on no other data about your visit, and nothing is stored on or read from your device for this purpose.',
};

const _RU_VISIT = {
  apart:
    'С вашим посещением этого сайта они не связываются; на вашем устройстве для этого ничего не сохраняется и не считывается.',
  links:
    'Если вы переходите с нашего сайта по ссылке на [наш бот в Telegram / наш магазин], наш сервер добавляет в ссылку, откуда вы пришли к нам в этот день (параметры кампании или сайт, с которого вы перешли, — коротким кодом). Других данных о вашем посещении мы не передаём, и на вашем устройстве для этого ничего не сохраняется и не считывается.',
};

const _visit = (
  texts: { readonly apart: string; readonly links: string },
  links: boolean
): string => (links ? texts.links : texts.apart);

export var PRIVACY_SAMPLES: readonly PrivacySample[] = [
  {
    language: 'Deutsch',
    lang: 'de',
    text: ({ months, links }) =>
      `Auswertung von Kundenwegen (pseudonym). Wenn Sie [unseren Telegram-Bot / unseren Shop / unsere App] nutzen, übermittelt dieser Dienst unserem Webserver Ereignisse wie „Start“, „Testphase begonnen“ oder „Zahlung eingegangen“. Jedes Ereignis trägt eine Kennung, die aus Ihrer Nutzerkennung so berechnet wird, dass wir Sie daraus nicht bestimmen können (Pseudonym), dazu Zeitpunkt, Betrag und Tarif, Ihre Antwort auf die Frage, wie Sie von uns erfahren haben, und die Kampagnenkennung des Links, über den Sie gekommen sind. Name, Kontaktdaten, Telefonnummer, Messenger-Kennung und Zahlungsdaten werden nicht übermittelt. Daraus werten wir aus, über welche Kanäle Kundinnen und Kunden zu uns finden und ob sich Werbung lohnt. ${_visit(_DE_VISIT, links)} Rechtsgrundlage ist unser berechtigtes Interesse an der Auswertung unseres Marketings (Art. 6 Abs. 1 lit. f DSGVO). Die Ereignisse speichern wir${_DE(months)}. Auf Ihren Wunsch löschen wir alle Ereignisse zu Ihrem Pseudonym; damit gelöschte Daten nicht erneut eingespielt werden, bleiben nur ein nicht umkehrbarer Hashwert des Pseudonyms und das Datum der Löschung.`,
  },
  {
    language: 'English',
    lang: 'en',
    text: ({ months, links }) =>
      `Customer journey analysis (pseudonymous). When you use [our Telegram bot / our shop / our app], that service sends our web server events such as “start”, “trial started” or “payment received”. Each event carries an identifier calculated from your user ID in such a way that we cannot identify you from it (a pseudonym), together with the time, the amount and plan, your answer to the question of how you heard about us, and the campaign identifier of the link you came through. Your name, contact details, phone number, messenger ID and payment details are not transmitted. From this we evaluate through which channels customers find us and whether advertising pays off. ${_visit(_EN_VISIT, links)} The legal basis is our legitimate interest in evaluating our marketing (Art. 6(1)(f) GDPR). We keep the events${_EN(months)}. At your request we delete all events relating to your pseudonym; so that deleted data is not imported again, only an irreversible hash of the pseudonym and the date of deletion remain.`,
  },
  {
    language: 'Русский',
    lang: 'ru',
    text: ({ months, links }) =>
      `Анализ пути клиентов (псевдонимно). Когда вы пользуетесь [нашим ботом в Telegram / нашим магазином / нашим приложением], этот сервис передаёт нашему веб-серверу события вроде «старт», «начат пробный период» или «оплата получена». Каждое событие несёт идентификатор, вычисленный из вашего идентификатора пользователя так, что по нему мы не можем установить вашу личность (псевдоним), а также время, сумму и тариф, ваш ответ на вопрос, откуда вы о нас узнали, и метку кампании ссылки, по которой вы пришли. Имя, контактные данные, номер телефона, идентификатор в мессенджере и платёжные данные не передаются. По этим данным мы оцениваем, по каким каналам к нам приходят клиенты и окупается ли реклама. ${_visit(_RU_VISIT, links)} Правовое основание — наш законный интерес в оценке собственного маркетинга (п. «f» ч. 1 ст. 6 GDPR). События мы храним${_RU(months)}. По вашей просьбе мы удаляем все события с вашим псевдонимом; чтобы удалённые данные не попали к нам снова, остаются только необратимый хэш псевдонима и дата удаления.`,
  },
];
