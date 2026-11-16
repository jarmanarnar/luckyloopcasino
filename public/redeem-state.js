// Preview amounts use integer hundredths, just like the SC wallet. No transfers
// or balance mutations are performed by this view.
export function redemptionAmount(value, availableUnits) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^(?:\d+|\d*\.\d{1,2}|\d+,\d{1,2})$/.test(text)) {
    return { ok: false, error: 'Enter an amount with up to two decimal places.' };
  }
  const [whole, fraction = ''] = text.replace(',', '.').split('.');
  const units = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(units) || units <= 0) {
    return { ok: false, error: 'Enter an amount greater than zero.' };
  }
  if (!Number.isSafeInteger(availableUnits) || availableUnits < units) {
    return { ok: false, error: 'This amount exceeds your available preview balance.' };
  }
  return { ok: true, units };
}
