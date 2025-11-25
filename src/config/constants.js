const GAME_CONSTANTS = {
  STATUS: {
    WAITING: 'waiting',
    STARTING: 'starting',
    IN_PROGRESS: 'in_progress',
    FINISHED: 'finished',
    CANCELLED: 'cancelled'
  },
  
  CARD: {
    SIZE: 5,
    FREE_SPACE: { row: 2, col: 2 }, // Center position
    NUMBER_RANGES: {
      'B': { min: 1, max: 15 },
      'I': { min: 16, max: 30 },
      'N': { min: 31, max: 45 },
      'G': { min: 46, max: 60 },
      'O': { min: 61, max: 75 }
    }
  },
  
  WINNING_PATTERNS: {
    LINE: 'line',
    FULL_HOUSE: 'full_house',
    FOUR_CORNERS: 'four_corners',
    DIAGONAL: 'diagonal'
  },
  
  REWARDS: {
    BASE_PRIZE: 50,
    SPEED_BONUS: 10,
    FULL_HOUSE_BONUS: 100,
    REFERRAL_BONUS: 25
  },
  
  TIMERS: {
    LOBBY: 30, // seconds
    GAME: 30, // seconds
    NUMBER_CALL_INTERVAL: 1.2, // seconds
    BINGO_CLAIM_TIMEOUT: 5, // seconds
    AUTO_START_DELAY: 5 // seconds
  }
};

const SOCKET_EVENTS = {
  // Connection events
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  
  // Game events
  JOIN_GAME: 'join_game',
  LEAVE_GAME: 'leave_game',
  GAME_STATE: 'game_state',
  GAME_START: 'game_start',
  GAME_END: 'game_end',
  
  // Player events
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  PLAYER_READY: 'player_ready',
  
  // Bingo events
  NUMBER_CALLED: 'number_called',
  CLAIM_BINGO: 'claim_bingo',
  BINGO_VALID: 'bingo_valid',
  BINGO_INVALID: 'bingo_invalid',
  
  // Room events
  ROOM_CREATED: 'room_created',
  ROOM_UPDATED: 'room_updated',
  ROOM_FULL: 'room_full'
};

const ERROR_MESSAGES = {
  GAME: {
    NOT_FOUND: 'Game not found',
    ALREADY_STARTED: 'Game has already started',
    FULL: 'Game is full',
    NOT_ENOUGH_PLAYERS: 'Not enough players to start game',
    INVALID_CARD: 'Invalid bingo card'
  },
  PLAYER: {
    NOT_FOUND: 'Player not found',
    ALREADY_IN_GAME: 'Player is already in a game',
    NOT_IN_GAME: 'Player is not in a game',
    INSUFFICIENT_COINS: 'Insufficient coins'
  },
  BINGO: {
    INVALID_CLAIM: 'Invalid bingo claim',
    ALREADY_CLAIMED: 'Bingo already claimed in this game',
    PATTERN_NOT_COMPLETE: 'Winning pattern not complete'
  }
};

module.exports = {
  GAME_CONSTANTS,
  SOCKET_EVENTS,
  ERROR_MESSAGES
};
