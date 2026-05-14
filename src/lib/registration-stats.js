// Promedio de rating para un tiempo dado (rapid|blitz|bullet).
// Por inscripto: si tiene chess y lichess en el tiempo → promedio de los dos.
// Si tiene solo uno → ese valor. Si no tiene ninguno → no cuenta.
// Devuelve un entero redondeado, o null si el set queda vacío.
export function averageRatingByTiempo(rows, tiempo) {
  const chessKey = `chess_rating_${tiempo}`
  const lichessKey = `lichess_rating_${tiempo}`
  const perPerson = []
  for (const r of rows) {
    const c = typeof r[chessKey] === 'number' ? r[chessKey] : null
    const l = typeof r[lichessKey] === 'number' ? r[lichessKey] : null
    if (c != null && l != null) perPerson.push((c + l) / 2)
    else if (c != null) perPerson.push(c)
    else if (l != null) perPerson.push(l)
  }
  if (perPerson.length === 0) return null
  return Math.round(perPerson.reduce((a, b) => a + b, 0) / perPerson.length)
}

// Cuenta inscriptos con al menos una plataforma cargada (chess o lichess).
export function onlineRatio(rows) {
  const total = rows.length
  if (total === 0) return { withAny: 0, total: 0, pct: null }
  const withAny = rows.filter(
    (r) => r.chess_username || r.lichess_username,
  ).length
  return { withAny, total, pct: Math.round((withAny / total) * 100) }
}
