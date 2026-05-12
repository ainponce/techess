import { supabase } from './supabase'

// Slug: lowercase, sin tildes, espacios → '-', solo [a-z0-9-]
export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function ensureUniqueSlug(base) {
  let candidate = base
  let n = 2
  while (n < 100) {
    const { data, error } = await supabase
      .from('tournaments')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (error) throw error
    if (!data) return candidate
    candidate = `${base}-${n}`
    n++
  }
  return `${base}-${Date.now()}`
}

export async function listTournaments() {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getTournament(id) {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createTournament({ name, tiempo, createdBy }) {
  const slug = await ensureUniqueSlug(slugify(name))
  const { data, error } = await supabase
    .from('tournaments')
    .insert({ name: name.trim(), slug, tiempo, created_by: createdBy })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTournament(id, patch) {
  const { data, error } = await supabase
    .from('tournaments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTournament(id) {
  const { error } = await supabase.from('tournaments').delete().eq('id', id)
  if (error) throw error
}

export async function listParticipants(tournamentId) {
  // Join contra techess_registrations para mostrar el nombre, email, chess, etc.
  const { data, error } = await supabase
    .from('tournament_participants')
    .select(`
      id, tournament_id, registration_id, seed_rating, withdrawn, created_at,
      registration:techess_registrations(
        id, nombre, email, chess_username, chess_avatar, chess_url, twitter_handle, phone,
        chess_rating_rapid, chess_rating_blitz, chess_rating_bullet
      )
    `)
    .eq('tournament_id', tournamentId)
  if (error) throw error
  return data
}

export async function addParticipants(tournamentId, items) {
  // items: [{ registration_id, seed_rating }]
  if (items.length === 0) return []
  const payload = items.map((it) => ({
    tournament_id: tournamentId,
    registration_id: it.registration_id,
    seed_rating: it.seed_rating,
  }))
  const { data, error } = await supabase
    .from('tournament_participants')
    .insert(payload)
    .select()
  if (error) throw error
  return data
}

export async function updateParticipantRating(participantId, seedRating) {
  const { data, error } = await supabase
    .from('tournament_participants')
    .update({ seed_rating: seedRating })
    .eq('id', participantId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function withdrawParticipant(participantId) {
  const { data, error } = await supabase
    .from('tournament_participants')
    .update({ withdrawn: true })
    .eq('id', participantId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeParticipant(participantId) {
  const { error } = await supabase
    .from('tournament_participants')
    .delete()
    .eq('id', participantId)
  if (error) throw error
}

export async function listMatches(tournamentId) {
  const { data, error } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: true })
  if (error) throw error
  return data
}

export async function insertMatches(matches) {
  if (matches.length === 0) return []
  const { data, error } = await supabase
    .from('tournament_matches')
    .insert(matches)
    .select()
  if (error) throw error
  return data
}

export async function updateMatchResult(matchId, result) {
  const { data, error } = await supabase
    .from('tournament_matches')
    .update({ result })
    .eq('id', matchId)
    .select()
    .single()
  if (error) throw error
  return data
}
