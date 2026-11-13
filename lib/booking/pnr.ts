// Swedish personnummer / samordningsnummer -> "YYYYMMDD-XXXX", or "" if invalid (date + Luhn check).
export function normPnr(raw: string): string {
  const d = raw.replace(/[\s\-+]/g, "");
  if (!/^\d{10}$|^\d{12}$/.test(d)) return "";
  let full = d;
  if (d.length === 10) {
    const yy = Number(d.slice(0, 2)), now = new Date().getFullYear();
    let year = 2000 + yy; if (year > now) year -= 100;
    if (raw.includes("+")) year -= 100;
    full = String(year) + d.slice(2);
  }
  const y = Number(full.slice(0, 4)), m = Number(full.slice(4, 6));
  let day = Number(full.slice(6, 8)); if (day > 60) day -= 60;
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (y < 1900 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) return "";
  const ten = full.slice(2);
  let sum = 0;
  for (let i = 0; i < 10; i++) { let n = Number(ten[i]) * (i % 2 === 0 ? 2 : 1); if (n > 9) n -= 9; sum += n; }
  if (sum % 10 !== 0) return "";
  return `${full.slice(0, 8)}-${full.slice(8)}`;
}

// Swedish organisationsnummer -> "XXXXXX-XXXX", or "" if invalid (third digit >= 2, Luhn check).
export function normOrgnr(raw: string): string {
  let d = raw.replace(/[\s\-]/g, "");
  if (/^16\d{10}$/.test(d)) d = d.slice(2);
  if (!/^\d{10}$/.test(d) || Number(d[2]) < 2) return "";
  let sum = 0;
  for (let i = 0; i < 10; i++) { let n = Number(d[i]) * (i % 2 === 0 ? 2 : 1); if (n > 9) n -= 9; sum += n; }
  return sum % 10 === 0 ? `${d.slice(0, 6)}-${d.slice(6)}` : "";
}
