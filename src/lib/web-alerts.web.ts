import { Alert } from 'react-native';
export function configureWebAlerts() {
  Alert.alert = (title, message, buttons, options) => {
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'max-width: min(480px, 90vw); padding: 24px; border-radius: 16px; background: #151d26; color: #eef3f8; border: 1px solid #38424e;';
    const heading = document.createElement('h2'); heading.textContent = title;
    const copy = document.createElement('p'); copy.textContent = message || '';
    dialog.append(heading, copy);
    for (const item of buttons?.length ? buttons : [{text:'确定'}]) {
      const button = document.createElement('button'); button.textContent = item.text || '确定';
      button.style.cssText = 'margin: 12px 12px 0 0; padding: 10px 18px; cursor: pointer;';
      button.onclick = () => { dialog.close(); dialog.remove(); item.onPress?.(); };
      dialog.append(button);
    }
    dialog.addEventListener('cancel', event => { if (options?.cancelable === false) event.preventDefault(); });
    dialog.addEventListener('close', () => { dialog.remove(); options?.onDismiss?.(); });
    document.body.append(dialog); dialog.showModal();
  };
}
