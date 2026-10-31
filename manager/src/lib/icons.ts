import activity from 'lucide-static/icons/activity.svg?raw';
import archiveRestore from 'lucide-static/icons/archive-restore.svg?raw';
import arrowDown from 'lucide-static/icons/arrow-down.svg?raw';
import arrowUp from 'lucide-static/icons/arrow-up.svg?raw';
import blocks from 'lucide-static/icons/blocks.svg?raw';
import bold from 'lucide-static/icons/bold.svg?raw';
import calendar from 'lucide-static/icons/calendar.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import chevronDown from 'lucide-static/icons/chevron-down.svg?raw';
import chevronLeft from 'lucide-static/icons/chevron-left.svg?raw';
import chevronRight from 'lucide-static/icons/chevron-right.svg?raw';
import chevronsDownUp from 'lucide-static/icons/chevrons-down-up.svg?raw';
import chevronsUpDown from 'lucide-static/icons/chevrons-up-down.svg?raw';
import circleAlert from 'lucide-static/icons/circle-alert.svg?raw';
import circleCheck from 'lucide-static/icons/circle-check.svg?raw';
import circleHelp from 'lucide-static/icons/circle-help.svg?raw';
import clipboardList from 'lucide-static/icons/clipboard-list.svg?raw';
import codeXml from 'lucide-static/icons/code-xml.svg?raw';
import component from 'lucide-static/icons/component.svg?raw';
import copy from 'lucide-static/icons/copy.svg?raw';
import database from 'lucide-static/icons/database.svg?raw';
import download from 'lucide-static/icons/download.svg?raw';
import ellipsis from 'lucide-static/icons/ellipsis.svg?raw';
import externalLink from 'lucide-static/icons/external-link.svg?raw';
import eye from 'lucide-static/icons/eye.svg?raw';
import eyeOff from 'lucide-static/icons/eye-off.svg?raw';
import file from 'lucide-static/icons/file.svg?raw';
import fileCode from 'lucide-static/icons/file-code.svg?raw';
import fileImage from 'lucide-static/icons/file-image.svg?raw';
import fileJson from 'lucide-static/icons/file-json.svg?raw';
import filePlus from 'lucide-static/icons/file-plus.svg?raw';
import fileSignal from 'lucide-static/icons/file-signal.svg?raw';
import fileSpreadsheet from 'lucide-static/icons/file-spreadsheet.svg?raw';
import fileTerminal from 'lucide-static/icons/file-terminal.svg?raw';
import fileText from 'lucide-static/icons/file-text.svg?raw';
import fileType from 'lucide-static/icons/file-type.svg?raw';
import folder from 'lucide-static/icons/folder.svg?raw';
import folderInput from 'lucide-static/icons/folder-input.svg?raw';
import folderTree from 'lucide-static/icons/folder-tree.svg?raw';
import image from 'lucide-static/icons/image.svg?raw';
import images from 'lucide-static/icons/images.svg?raw';
import inbox from 'lucide-static/icons/inbox.svg?raw';
import italic from 'lucide-static/icons/italic.svg?raw';
import keyRound from 'lucide-static/icons/key-round.svg?raw';
import layoutTemplate from 'lucide-static/icons/layout-template.svg?raw';
import link from 'lucide-static/icons/link.svg?raw';
import list from 'lucide-static/icons/list.svg?raw';
import listOrdered from 'lucide-static/icons/list-ordered.svg?raw';
import logOut from 'lucide-static/icons/log-out.svg?raw';
import mail from 'lucide-static/icons/mail.svg?raw';
import moon from 'lucide-static/icons/moon.svg?raw';
import palette from 'lucide-static/icons/palette.svg?raw';
import panelLeft from 'lucide-static/icons/panel-left.svg?raw';
import panelLeftClose from 'lucide-static/icons/panel-left-close.svg?raw';
import panelLeftOpen from 'lucide-static/icons/panel-left-open.svg?raw';
import pencil from 'lucide-static/icons/pencil.svg?raw';
import phone from 'lucide-static/icons/phone.svg?raw';
import plug from 'lucide-static/icons/plug.svg?raw';
import plus from 'lucide-static/icons/plus.svg?raw';
import quote from 'lucide-static/icons/quote.svg?raw';
import refreshCw from 'lucide-static/icons/refresh-cw.svg?raw';
import search from 'lucide-static/icons/search.svg?raw';
import send from 'lucide-static/icons/send.svg?raw';
import settings from 'lucide-static/icons/settings.svg?raw';
import sun from 'lucide-static/icons/sun.svg?raw';
import textCursorInput from 'lucide-static/icons/text-cursor-input.svg?raw';
import trash from 'lucide-static/icons/trash-2.svg?raw';
import type from 'lucide-static/icons/type.svg?raw';
import upload from 'lucide-static/icons/upload.svg?raw';
import userPlus from 'lucide-static/icons/user-plus.svg?raw';
import users from 'lucide-static/icons/users.svg?raw';
import wandSparkles from 'lucide-static/icons/wand-sparkles.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';
import logo from '#lib/brand/logo.svg?raw';

// Значки — Lucide (ISC). Размер задаёт CSS, поэтому width/height из исходника убираем;
// линия тоньше стандартной 2 — под текст 14–15 px; для читалки значки скрыты, смысл несёт подпись.
const _icon = (raw: string): string =>
  raw
    .replace(/<!--[\s\S]*?-->\s*/, '')
    .replace(/\s(?:width|height)="24"/g, '')
    .replace('stroke-width="2"', 'stroke-width="1.75"')
    .replace('<svg', '<svg aria-hidden="true" focusable="false"')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

// Значка CSS в Lucide нет: контур file-code и решётка — как в селекторах и цветах.
const fileHash =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10.5 11.5 10 18.5"/><path d="M14.5 11.5 14 18.5"/><path d="M8.5 13.5h7"/><path d="M8.5 16.5h7"/></svg>';

export var icons = {
  activity: _icon(activity),
  alert: _icon(circleAlert),
  arrowDown: _icon(arrowDown),
  arrowUp: _icon(arrowUp),
  blocks: _icon(blocks),
  bold: _icon(bold),
  calendar: _icon(calendar),
  check: _icon(check),
  chevron: _icon(chevronRight),
  chevronDown: _icon(chevronDown),
  chevronLeft: _icon(chevronLeft),
  close: _icon(x),
  code: _icon(codeXml),
  collapse: _icon(chevronsDownUp),
  component: _icon(component),
  copy: _icon(copy),
  expand: _icon(chevronsUpDown),
  external: _icon(externalLink),
  eye: _icon(eye),
  eyeOff: _icon(eyeOff),
  help: _icon(circleHelp),
  wand: _icon(wandSparkles),
  database: _icon(database),
  download: _icon(download),
  fileJson: _icon(fileJson),
  fields: _icon(textCursorInput),
  file: _icon(fileText),
  fileBlank: _icon(file),
  fileCode: _icon(fileCode),
  fileFeed: _icon(fileSignal),
  fileHash: _icon(fileHash),
  fileImage: _icon(fileImage),
  fileTable: _icon(fileSpreadsheet),
  fileScript: _icon(fileTerminal),
  fileType: _icon(fileType),
  filePlus: _icon(filePlus),
  folder: _icon(folder),
  folderInput: _icon(folderInput),
  forms: _icon(clipboardList),
  image: _icon(image),
  inbox: _icon(inbox),
  images: _icon(images),
  italic: _icon(italic),
  key: _icon(keyRound),
  link: _icon(link),
  list: _icon(list),
  listOrdered: _icon(listOrdered),
  logout: _icon(logOut),
  mail: _icon(mail),
  menu: _icon(panelLeft),
  more: _icon(ellipsis),
  palette: _icon(palette),
  panelClose: _icon(panelLeftClose),
  panelOpen: _icon(panelLeftOpen),
  pencil: _icon(pencil),
  phone: _icon(phone),
  plug: _icon(plug),
  plus: _icon(plus),
  quote: _icon(quote),
  refresh: _icon(refreshCw),
  restore: _icon(archiveRestore),
  saved: _icon(circleCheck),
  search: _icon(search),
  send: _icon(send),
  settings: _icon(settings),
  template: _icon(layoutTemplate),
  text: _icon(type),
  trash: _icon(trash),
  upload: _icon(upload),
  userPlus: _icon(userPlus),
  tree: _icon(folderTree),
  users: _icon(users),
  sun: _icon(sun),
  moon: _icon(moon),
};

/** Знак Eile — manager/src/lib/brand/logo.svg: на входе и в шапке, пока у сайта название программы. */
export { logo };
