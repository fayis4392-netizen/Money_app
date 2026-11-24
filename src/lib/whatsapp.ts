/** International number for wa.me: digits only; a Saudi local 05… number becomes 9665… */
export function waNumber(phone: string) {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1)
  return d
}
