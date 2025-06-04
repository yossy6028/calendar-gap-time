/**
 * 高機能ロガーシステム
 * 構造化ログ、パフォーマンス監視、エラートラッキングを提供
 */

import { LOG_LEVELS, getConfig } from '../config/constants.js';

/**
 * ログエントリの構造
 */
class LogEntry {
  constructor(level, message, data = null, error = null) {
    this.timestamp = new Date().toISOString();
    this.level = level;
    this.message = message;
    this.data = data;
    this.error = error;
    this.sessionId = Logger.getSessionId();
    this.userId = Logger.getUserId();
    this.userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : 'Unknown';
    this.url = typeof window !== 'undefined' ? window.location.href : 'Unknown';
  }

  /**
   * JSON形式でシリアライズ
   */
  toJSON() {
    return {
      timestamp: this.timestamp,
      level: this.level,
      message: this.message,
      data: this.data,
      error: this.error ? {
        name: this.error.name,
        message: this.error.message,
        stack: this.error.stack
      } : null,
      sessionId: this.sessionId,
      userId: this.userId,
      userAgent: this.userAgent,
      url: this.url
    };
  }

  /**
   * 人間が読みやすい形式
   */
  toString() {
    const errorStr = this.error ? ` [Error: ${this.error.message}]` : '';
    const dataStr = this.data ? ` [Data: ${JSON.stringify(this.data)}]` : '';
    return `[${this.timestamp}] [${this.level}] ${this.message}${errorStr}${dataStr}`;
  }
}

/**
 * パフォーマンス測定クラス
 */
class PerformanceTracker {
  constructor() {
    this.timers = new Map();
    this.metrics = new Map();
  }

  /**
   * タイマー開始
   */
  startTimer(name) {
    this.timers.set(name, performance.now());
  }

  /**
   * タイマー終了と結果取得
   */
  endTimer(name) {
    const startTime = this.timers.get(name);
    if (!startTime) {
      Logger.warn(`Timer "${name}" was not started`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(name);
    
    // メトリクス記録
    this.recordMetric(name, duration);
    
    return duration;
  }

  /**
   * メトリクス記録
   */
  recordMetric(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name);
    values.push({
      value,
      timestamp: Date.now()
    });

    // 古いメトリクスの削除（最新100件のみ保持）
    if (values.length > 100) {
      values.splice(0, values.length - 100);
    }
  }

  /**
   * メトリクス統計取得
   */
  getMetricStats(name) {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) {
      return null;
    }

    const nums = values.map(v => v.value);
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;
    const min = Math.min(...nums);
    const max = Math.max(...nums);

    return {
      count: nums.length,
      sum,
      average: avg,
      min,
      max,
      latest: nums[nums.length - 1]
    };
  }

  /**
   * 全メトリクス取得
   */
  getAllMetrics() {
    const result = {};
    for (const [name] of this.metrics) {
      result[name] = this.getMetricStats(name);
    }
    return result;
  }
}

/**
 * メインロガークラス
 */
class LoggerClass {
  constructor() {
    this.config = getConfig();
    this.currentLogLevel = this.parseLogLevel(this.config.logLevel);
    this.sessionId = this.generateSessionId();
    this.userId = null;
    this.logBuffer = [];
    this.maxBufferSize = 1000;
    this.performance = new PerformanceTracker();
    this.errorCounts = new Map();
    
    // 開発環境でのみコンソール出力を有効化
    this.enableConsoleOutput = this.config.isDevelopment || this.config.enableLogging;
    
    // エラーハンドラー登録
    this.registerGlobalErrorHandlers();
  }

  /**
   * セッションID生成
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * セッションID取得
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * ユーザーID設定
   */
  setUserId(userId) {
    this.userId = userId;
    this.info('User ID set', { userId });
  }

  /**
   * ユーザーID取得
   */
  getUserId() {
    return this.userId;
  }

  /**
   * ログレベル解析
   */
  parseLogLevel(levelString) {
    const level = LOG_LEVELS[levelString.toUpperCase()];
    return level !== undefined ? level : LOG_LEVELS.INFO;
  }

  /**
   * ログレベル設定
   */
  setLogLevel(level) {
    this.currentLogLevel = this.parseLogLevel(level);
    this.info('Log level changed', { newLevel: level });
  }

  /**
   * ログレベルチェック
   */
  shouldLog(level) {
    return LOG_LEVELS[level] >= this.currentLogLevel;
  }

  /**
   * ログエントリ作成
   */
  createLogEntry(level, message, data = null, error = null) {
    const entry = new LogEntry(level, message, data, error);
    
    // バッファに追加
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }
    
    return entry;
  }

  /**
   * ログ出力
   */
  log(level, message, data = null, error = null) {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.createLogEntry(level, message, data, error);
    
    // コンソール出力
    if (this.enableConsoleOutput) {
      this.outputToConsole(entry);
    }
    
    // エラーカウント更新
    if (level === 'ERROR') {
      this.incrementErrorCount(message);
    }
    
    // 外部ログサービスへの送信（本番環境）
    if (!this.config.isDevelopment) {
      this.sendToLogService(entry);
    }
  }

  /**
   * コンソール出力
   */
  outputToConsole(entry) {
    const consoleMethod = this.getConsoleMethod(entry.level);
    const formattedMessage = this.formatConsoleMessage(entry);
    
    if (entry.error) {
      consoleMethod(formattedMessage, entry.error);
    } else if (entry.data) {
      consoleMethod(formattedMessage, entry.data);
    } else {
      consoleMethod(formattedMessage);
    }
  }

  /**
   * コンソールメソッド取得
   */
  getConsoleMethod(level) {
    switch (level) {
      case 'ERROR': return console.error.bind(console);
      case 'WARN': return console.warn.bind(console);
      case 'DEBUG': return console.debug.bind(console);
      default: return console.log.bind(console);
    }
  }

  /**
   * コンソールメッセージフォーマット
   */
  formatConsoleMessage(entry) {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const icon = this.getLevelIcon(entry.level);
    return `${icon} [${timestamp}] [${entry.level}] ${entry.message}`;
  }

  /**
   * レベルアイコン取得
   */
  getLevelIcon(level) {
    switch (level) {
      case 'ERROR': return '❌';
      case 'WARN': return '⚠️';
      case 'INFO': return 'ℹ️';
      case 'DEBUG': return '🔍';
      default: return '📝';
    }
  }

  /**
   * エラーカウント増加
   */
  incrementErrorCount(errorType) {
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);
  }

  /**
   * エラー統計取得
   */
  getErrorStats() {
    return Object.fromEntries(this.errorCounts);
  }

  /**
   * 外部ログサービス送信
   */
  async sendToLogService(entry) {
    try {
      // 実際の実装では外部ログサービス（CloudWatch, DataDog等）にPOST
      // 現在はローカルストレージに保存
      const logs = JSON.parse(localStorage.getItem('app_logs') || '[]');
      logs.push(entry.toJSON());
      
      // 最新1000件のみ保持
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }
      
      localStorage.setItem('app_logs', JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to send log to service:', error);
    }
  }

  /**
   * グローバルエラーハンドラー登録
   */
  registerGlobalErrorHandlers() {
    if (typeof window === 'undefined') return;

    // 未処理エラー
    window.addEventListener('error', (event) => {
      this.error('Unhandled Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }, event.error);
    });

    // 未処理Promise拒否
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', {
        reason: event.reason
      });
    });
  }

  /**
   * ログレベル別メソッド
   */
  debug(message, data = null) {
    this.log('DEBUG', message, data);
  }

  info(message, data = null) {
    this.log('INFO', message, data);
  }

  warn(message, data = null) {
    this.log('WARN', message, data);
  }

  error(message, error = null, data = null) {
    this.log('ERROR', message, data, error);
  }

  /**
   * パフォーマンス測定
   */
  startPerformanceTimer(name) {
    this.performance.startTimer(name);
    this.debug(`Performance timer started: ${name}`);
  }

  endPerformanceTimer(name) {
    const duration = this.performance.endTimer(name);
    this.info(`Performance timer ended: ${name}`, { 
      duration: `${duration.toFixed(2)}ms` 
    });
    return duration;
  }

  /**
   * パフォーマンス統計取得
   */
  getPerformanceStats() {
    return this.performance.getAllMetrics();
  }

  /**
   * システム情報ログ
   */
  logSystemInfo() {
    if (typeof window === 'undefined') return;

    this.info('System Information', {
      userAgent: window.navigator.userAgent,
      language: window.navigator.language,
      platform: window.navigator.platform,
      cookieEnabled: window.navigator.cookieEnabled,
      onLine: window.navigator.onLine,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      memoryInfo: window.performance?.memory ? {
        usedJSHeapSize: window.performance.memory.usedJSHeapSize,
        totalJSHeapSize: window.performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit
      } : 'Not available'
    });
  }

  /**
   * ログバッファ取得
   */
  getLogBuffer() {
    return this.logBuffer.slice();
  }

  /**
   * ログバッファクリア
   */
  clearLogBuffer() {
    this.logBuffer = [];
    this.info('Log buffer cleared');
  }

  /**
   * ログエクスポート
   */
  exportLogs() {
    const logs = this.getLogBuffer();
    const exportData = {
      exportTime: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      logCount: logs.length,
      logs: logs.map(entry => entry.toJSON()),
      performanceStats: this.getPerformanceStats(),
      errorStats: this.getErrorStats()
    };
    
    return JSON.stringify(exportData, null, 2);
  }
}

// シングルトンインスタンス
const Logger = new LoggerClass();

// デバッグ用にグローバルスコープに公開（開発環境のみ）
if (typeof window !== 'undefined' && Logger.config.isDevelopment) {
  window.Logger = Logger;
}

export default Logger; 