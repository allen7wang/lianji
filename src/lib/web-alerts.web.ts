import { Alert, type AlertButton } from 'react-native';
import { palettes, type Palette } from '@/ui/theme';

const STYLE_ID = 'lianji-alert-style';

const vars = (p: Palette) => `--lj-surface:${p.surface};--lj-alt:${p.surfaceAlt};--lj-border:${p.border};--lj-text:${p.text};--lj-muted:${p.textMuted};--lj-accent:${p.accent};--lj-on-accent:${p.onAccent};--lj-danger:${p.danger};--lj-danger-soft:${p.dangerSoft};--lj-overlay:${p.overlay};`;

// Tokens from src/ui/theme.ts; the dialog follows the system scheme like the rest of the app.
const css = `
.lj-alert{${vars(palettes.light)}}
@media (prefers-color-scheme: dark){.lj-alert{${vars(palettes.dark)}}}
.lj-alert{box-sizing:border-box;width:min(400px,calc(100vw - 40px));max-width:none;margin:auto;padding:24px;border-radius:20px;border:1px solid var(--lj-border);background:var(--lj-surface);color:var(--lj-text);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",Roboto,"Noto Sans SC","Helvetica Neue",sans-serif;box-shadow:0 16px 48px rgba(0,0,0,.18)}
.lj-alert::backdrop{background:var(--lj-overlay)}
.lj-alert h2{margin:0;font-size:17px;line-height:22px;font-weight:700}
.lj-alert p{margin:8px 0 0;font-size:15px;line-height:22px;font-weight:500;color:var(--lj-muted);white-space:pre-line}
.lj-alert .lj-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:20px}
.lj-alert button{min-height:44px;padding:0 20px;border:0;border-radius:999px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;background:var(--lj-alt);color:var(--lj-text)}
.lj-alert button.lj-primary{background:var(--lj-accent);color:var(--lj-on-accent)}
.lj-alert button.lj-destructive{background:var(--lj-danger-soft);color:var(--lj-danger)}
.lj-alert button.lj-cancel{background:transparent;color:var(--lj-muted)}
.lj-alert button:hover{opacity:.85}
.lj-alert button:focus-visible{outline:2px solid var(--lj-accent);outline-offset:2px}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.append(style);
}

/** The single orange button: the preferred one, else the last plain (non-cancel, non-destructive) button. */
function primaryIndex(buttons: AlertButton[]) {
  const preferred = buttons.findIndex(button => button.isPreferred);
  if (preferred >= 0) return preferred;
  for (let index = buttons.length - 1; index >= 0; index -= 1) {
    if (!buttons[index].style || buttons[index].style === 'default') return index;
  }
  return -1;
}

let counter = 0;

export function configureWebAlerts() {
  Alert.alert = (title, message, buttons, options) => {
    ensureStyle();
    const items: AlertButton[] = buttons?.length ? buttons : [{ text: '确定' }];
    const primary = primaryIndex(items);
    const key = `lj-alert-${++counter}`;
    const dialog = document.createElement('dialog');
    dialog.className = 'lj-alert';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-labelledby', `${key}-title`);
    const heading = document.createElement('h2');
    heading.id = `${key}-title`;
    heading.textContent = title;
    dialog.append(heading);
    if (message) {
      const copy = document.createElement('p');
      copy.id = `${key}-message`;
      copy.textContent = message;
      dialog.setAttribute('aria-describedby', copy.id);
      dialog.append(copy);
    }
    const actions = document.createElement('div');
    actions.className = 'lj-actions';
    let handled = false;
    let focusTarget: HTMLButtonElement | null = null;
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.text || '确定';
      button.className = item.style === 'cancel' ? 'lj-cancel' : item.style === 'destructive' ? 'lj-destructive' : index === primary ? 'lj-primary' : '';
      button.onclick = () => { handled = true; dialog.close(); (item.onPress as (() => void) | undefined)?.(); };
      // Start on the safe choice so Enter never confirms a destructive action by accident.
      if (item.style === 'cancel' || (!focusTarget && index === primary)) focusTarget = button;
      actions.append(button);
    });
    dialog.append(actions);
    dialog.addEventListener('cancel', event => { if (options?.cancelable === false) event.preventDefault(); });
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (!handled) options?.onDismiss?.();
    });
    document.body.append(dialog);
    dialog.showModal();
    (focusTarget as HTMLButtonElement | null)?.focus();
  };
}
