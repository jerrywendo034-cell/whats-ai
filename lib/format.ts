export function kes(amount: number) {
  return `KES ${Math.round(amount).toLocaleString("en-KE")}`;
}

export function digitsPhone(value: string) {
  return String(value).replace(/[^\d]/g, "").replace(/^0/, "254");
}
