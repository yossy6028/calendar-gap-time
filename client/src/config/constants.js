/**
 * アプリケーション設定ファイル
 * 全ての定数、APIエンドポイント、設定値を集約管理
 */

// 時間管理関連の定数
export const TIME_CONSTANTS = {
  SLOT_DURATION_MINUTES: 30,
  BUFFER_TIME_MINUTES: 20,
  CORE_TIME_START_HOUR: 10,
  CORE_TIME_END_HOUR: 22,
  DEFAULT_PERIOD_DAYS: 7,
  MIN_SLOT_DURATION: 30,
  MAX_SLOT_DURATION: 120,
  WORK_DAYS_PER_WEEK: 7
};

// API制御関連の定数（Rate Limit対応強化）
export const API_CONSTANTS = {
  MAX_RETRY_ATTEMPTS: 3,
  INITIAL_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 5000,
  EXPONENTIAL_BACKOFF_MULTIPLIER: 2,
  REQUEST_TIMEOUT_MS: 10000,
  RATE_LIMIT_DELAY_MS: 60000,  // Rate limit時の待機時間
  MAX_CONCURRENT_REQUESTS: 3,   // 同時リクエスト数制限
  QUOTA_EXCEEDED_DELAY_MS: 300000, // 5分間の待機
  BATCH_SIZE: 5 // バッチリクエストサイズ
};

// UIアニメーション関連の定数
export const UI_CONSTANTS = {
  FADE_ANIMATION_DURATION: 1000,
  ZOOM_ANIMATION_DURATION: 1200,
  CARD_HOVER_DELAY: 300,
  NOTIFICATION_AUTO_HIDE_DURATION: 5000,
  DEBOUNCE_DELAY: 500
};

// Google Calendar API エンドポイント
export const API_ENDPOINTS = {
  CALENDAR_LIST: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
  EVENTS: (calendarId) => 
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
  BATCH: 'https://www.googleapis.com/batch/calendar/v3'
};

// エラーメッセージの集約管理
export const ERROR_MESSAGES = {
  AUTH_FAILED: 'Google認証に失敗しました',
  CALENDAR_FETCH_FAILED: 'カレンダーデータの取得に失敗しました',
  ELECTRON_REQUIRED: 'Electron環境でのみGoogle認証が利用可能です',
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
  TIMEOUT_ERROR: 'リクエストがタイムアウトしました',
  RATE_LIMIT_EXCEEDED: 'API使用制限に達しました。しばらく待ってから再試行してください',
  QUOTA_EXCEEDED: 'API使用量上限に達しました。明日再試行してください',
  INVALID_DATE_RANGE: '不正な日付範囲が指定されました',
  INVALID_TIME_FORMAT: '時間形式が正しくありません',
  VALIDATION_FAILED: '入力値の検証に失敗しました'
};

// 成功メッセージ
export const SUCCESS_MESSAGES = {
  AUTH_SUCCESS: 'Google認証が完了しました',
  DATA_LOADED: 'カレンダーデータを読み込みました',
  TIME_SLOT_ADDED: '希望時間帯を追加しました',
  TIME_SLOT_REMOVED: '希望時間帯を削除しました'
};

// ログレベル
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// テーマカラー設定
export const THEME_COLORS = {
  PRIMARY_GRADIENT: 'linear-gradient(145deg, #667eea 0%, #764ba2 100%)',
  CARD_GRADIENT: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
  BUTTON_GRADIENT: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
  SUCCESS_GRADIENT: 'linear-gradient(45deg, #4CAF50 30%, #8BC34A 90%)',
  WARNING_GRADIENT: 'linear-gradient(45deg, #FF9800 30%, #FFC107 90%)',
  ERROR_GRADIENT: 'linear-gradient(45deg, #F44336 30%, #E91E63 90%)'
};

// 環境変数からの設定読み込み（セキュリティ強化）
export const getConfig = () => ({
  isDevelopment: process.env.NODE_ENV === 'development',
  apiKey: process.env.REACT_APP_GOOGLE_API_KEY || '',
  clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID || '',
  enableLogging: process.env.REACT_APP_ENABLE_LOGGING === 'true',
  logLevel: process.env.REACT_APP_LOG_LEVEL || 'INFO',
  apiBaseUrl: process.env.REACT_APP_API_BASE_URL || 'https://www.googleapis.com',
  enableMockData: process.env.REACT_APP_ENABLE_MOCK_DATA === 'true'
});

// バリデーションルール
export const VALIDATION_RULES = {
  DATE: {
    MIN_DATE: new Date('2020-01-01'),
    MAX_DATE: new Date('2030-12-31'),
    REQUIRED: true
  },
  TIME: {
    FORMAT: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
    REQUIRED: true
  },
  TIME_RANGE: {
    MIN_DURATION_MINUTES: 15,
    MAX_DURATION_MINUTES: 720, // 12時間
    CORE_TIME_START: '10:00',
    CORE_TIME_END: '22:00'
  }
}; 