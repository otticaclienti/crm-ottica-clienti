import { createClient } from "@supabase/supabase-js";

// Valori predefiniti (chiavi PUBBLICHE, protette dalle regole di sicurezza del
// database). Si possono sovrascrivere con un file .env se necessario.
const DEFAULT_URL = "https://azexrewuoantizffdveo.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6ZXhyZXd1b2FudGl6ZmZkdmVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0ODk5OTAsImV4cCI6MjEwMTA2NTk5MH0.4rrGX5A6hZuMg4-qQU6Eb10hErYAE8D1R0iEK9qmTB4";

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) || DEFAULT_URL;
export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || DEFAULT_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // Gestiamo noi il link di recupero password (vedi Login.tsx), così
  // l'app non consuma da sola il token nell'URL.
  auth: { detectSessionInUrl: false },
});

// URL della funzione che gestisce gli utenti (usata solo dall'admin)
export const ADMIN_FN_URL = `${SUPABASE_URL}/functions/v1/admin-user`;
export const INGEST_FN_URL = `${SUPABASE_URL}/functions/v1/ingest-lead`;

/**
 * Legge TUTTE le righe di una query a pagine: PostgREST limita a 1000 righe
 * per richiesta, quindi le pipeline grandi (1000+ lead) altrimenti si
 * troncano e i lead spariscono dalla bacheca.
 */
export async function fetchAllRows(query: any, pageSize = 1000): Promise<any[]> {
  const rows: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data as any[]) ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
