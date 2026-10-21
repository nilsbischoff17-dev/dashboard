// Persönliche Einstellungen der App.
// googleClientId: OAuth-Client-ID (Typ „Webanwendung“) aus der Google Cloud Console, siehe README.
// Die Client-ID ist nicht geheim und darf im Repository stehen.
export const CONFIG = {
  googleClientId: '1016199256617-53qd9e98rrco47mnc2jq97knfapraldj.apps.googleusercontent.com',
  dashboardFolderId: '1WkQ2aG6HGR0q5gS3TVqkJY0j7JTkLAbG',
  // Voller Drive-Zugriff ist nötig, weil die Dateien auch von Claude und dem PC angelegt werden
  // (drive.file sähe nur Dateien, die diese App selbst erstellt hat).
  scopes: ['https://www.googleapis.com/auth/drive'],
};
