// Database client for D1
// This will be populated when D1 is available

export interface Game {
  id: string;
  date: string;
  time: string;
  signupDeadline: string;
  status: 'open' | 'closed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface Signup {
  id: string;
  gameId: string;
  playerName: string;
  status: 'in' | 'out';
  createdAt: string;
  updatedAt: string;
}

export interface Regular {
  id: string;
  name: string;
  aliases: string[];
  createdAt: string;
}

// Mock database for development (will be replaced with D1)
const mockGames: Game[] = [
  {
    id: 'game-001',
    date: '2026-03-02',
    time: '09:00',
    signupDeadline: '2026-03-01T18:00:00Z',
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'game-002',
    date: '2026-03-09',
    time: '09:00',
    signupDeadline: '2026-03-08T18:00:00Z',
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockSignups: Signup[] = [
  { id: '1', gameId: 'game-001', playerName: 'Cameron', status: 'in', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '2', gameId: 'game-001', playerName: 'Gib', status: 'in', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '3', gameId: 'game-002', playerName: 'Cameron', status: 'in', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '4', gameId: 'game-002', playerName: 'Gary', status: 'in', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '5', gameId: 'game-002', playerName: 'Dorothy', status: 'in', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '6', gameId: 'game-002', playerName: 'Gib', status: 'out', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const mockRegulars: Regular[] = [
  { id: '1', name: 'Cameron', aliases: [], createdAt: new Date().toISOString() },
  { id: '2', name: 'Gib', aliases: [], createdAt: new Date().toISOString() },
  { id: '3', name: 'Gary', aliases: ['g'], createdAt: new Date().toISOString() },
  { id: '4', name: 'Dorothy', aliases: ['d'], createdAt: new Date().toISOString() },
  { id: '5', name: 'Jason', aliases: ['Bubbles'], createdAt: new Date().toISOString() },
  { id: '6', name: 'Mike', aliases: [], createdAt: new Date().toISOString() },
];

export async function getGames(): Promise<Game[]> {
  // TODO: Replace with D1 query
  return mockGames;
}

export async function getGame(id: string): Promise<Game | null> {
  // TODO: Replace with D1 query
  return mockGames.find(g => g.id === id) || null;
}

export async function createGame(data: Omit<Game, 'id' | 'createdAt' | 'updatedAt'>): Promise<Game> {
  // TODO: Replace with D1 query
  const game: Game = {
    id: `game-${Date.now()}`,
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockGames.push(game);
  return game;
}

export async function updateGame(id: string, data: Partial<Game>): Promise<Game | null> {
  // TODO: Replace with D1 query
  const game = mockGames.find(g => g.id === id);
  if (!game) return null;
  Object.assign(game, data, { updatedAt: new Date().toISOString() });
  return game;
}

export async function getSignupsForGame(gameId: string): Promise<{ in: string[]; out: string[] }> {
  // TODO: Replace with D1 query
  const gameSignups = mockSignups.filter(s => s.gameId === gameId);
  return {
    in: gameSignups.filter(s => s.status === 'in').map(s => s.playerName),
    out: gameSignups.filter(s => s.status === 'out').map(s => s.playerName),
  };
}

export async function addSignup(gameId: string, playerName: string, status: 'in' | 'out'): Promise<Signup> {
  // TODO: Replace with D1 query
  const existing = mockSignups.find(s => s.gameId === gameId && s.playerName === playerName);
  if (existing) {
    existing.status = status;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  const signup: Signup = {
    id: `signup-${Date.now()}`,
    gameId,
    playerName,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockSignups.push(signup);
  return signup;
}

export async function getRegulars(): Promise<Regular[]> {
  // TODO: Replace with D1 query
  return mockRegulars;
}
