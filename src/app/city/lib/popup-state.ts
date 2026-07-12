let popupClosing = false;

export function setPopupClosing(closing: boolean) {
  popupClosing = closing;
}

export function isPopupClosing() {
  return popupClosing;
}
