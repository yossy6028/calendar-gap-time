/**
 * API通信サービス
 * Rate Limit対応、リトライ機能、キャッシュ、並行制御を提供
 */

import { 
  API_CONSTANTS, 
  ERROR_MESSAGES,
  getConfig 
} from '../config/constants.js';
import Logger from '../utils/logger.js';

/**
 * APIエラークラス
 */
export class ApiError extends Error {
  constructor(message, status = null, response = null, isRateLimit = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.response = response;
    this.isRateLimit = isRateLimit;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Rate Limitエラーかチェック
   */
  isRateLimited() {
    return this.isRateLimit || 
           this.status === 429 || 
           this.message.includes('rate limit') ||
           this.message.includes('quota exceeded');
  }

  /**
   * 認証エラーかチェック
   */
  isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  /**
   * 一時的なエラーかチェック
   */
  isTemporary() {
    return this.status >= 500 || this.status === 429 || this.status === 408;
  }
}

/**
 * レスポンスキャッシュクラス
 */
class ResponseCache {
  constructor(maxSize = 100, ttlMinutes = 5) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000; // ミリ秒
  }

  /**
   * キャッシュキー生成
   */
  generateKey(url, options) {
    const method = options.method || 'GET';
    const body = options.body || '';
    return `${method}:${url}:${body}`;
  }

  /**
   * キャッシュ取得
   */
  get(url, options) {
    const key = this.generateKey(url, options);
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }

    // TTL チェック
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    Logger.debug('Cache hit', { url, key });
    return cached.data;
  }

  /**
   * キャッシュ設定
   */
  set(url, options, data) {
    const key = this.generateKey(url, options);
    
    // キャッシュサイズ制限
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    Logger.debug('Cache set', { url, key });
  }

  /**
   * キャッシュクリア
   */
  clear() {
    this.cache.clear();
    Logger.info('Cache cleared');
  }

  /**
   * 特定URLのキャッシュ削除
   */
  delete(url, options) {
    const key = this.generateKey(url, options);
    this.cache.delete(key);
  }
}

/**
 * 並行制御クラス
 */
class ConcurrencyManager {
  constructor(maxConcurrent = API_CONSTANTS.MAX_CONCURRENT_REQUESTS) {
    this.maxConcurrent = maxConcurrent;
    this.activeRequests = 0;
    this.queue = [];
  }

  /**
   * リクエスト実行
   */
  async execute(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * キュー処理
   */
  async processQueue() {
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const { requestFn, resolve, reject } = this.queue.shift();
    this.activeRequests++;

    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      this.processQueue(); // 次のリクエストを処理
    }
  }

  /**
   * 状態取得
   */
  getStatus() {
    return {
      activeRequests: this.activeRequests,
      queueLength: this.queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}

/**
 * APIサービスクラス
 */
class ApiServiceClass {
  constructor() {
    this.config = getConfig();
    this.cache = new ResponseCache();
    this.concurrencyManager = new ConcurrencyManager();
    this.rateLimitResetTime = null;
    this.requestCounts = new Map(); // URL別リクエスト数追跡
    
    Logger.info('API Service initialized', { 
      baseUrl: this.config.apiBaseUrl,
      enableMockData: this.config.enableMockData
    });
  }

  /**
   * 指数バックオフ計算
   */
  calculateBackoffDelay(attempt) {
    const baseDelay = API_CONSTANTS.INITIAL_RETRY_DELAY_MS;
    const multiplier = API_CONSTANTS.EXPONENTIAL_BACKOFF_MULTIPLIER;
    const maxDelay = API_CONSTANTS.MAX_RETRY_DELAY_MS;
    
    const delay = Math.min(
      baseDelay * Math.pow(multiplier, attempt),
      maxDelay
    );
    
    // ジッターを追加（±25%）
    const jitter = delay * 0.25 * (Math.random() - 0.5);
    return Math.max(delay + jitter, 0);
  }

  /**
   * Rate Limit チェック
   */
  checkRateLimit() {
    if (this.rateLimitResetTime && Date.now() < this.rateLimitResetTime) {
      const waitTime = this.rateLimitResetTime - Date.now();
      throw new ApiError(
        `${ERROR_MESSAGES.RATE_LIMIT_EXCEEDED} (${Math.ceil(waitTime / 1000)}秒後に再試行可能)`,
        429,
        null,
        true
      );
    }
  }

  /**
   * リクエスト数更新
   */
  updateRequestCount(url) {
    const count = this.requestCounts.get(url) || 0;
    this.requestCounts.set(url, count + 1);
    
    // 古いカウントをクリア（1時間毎）
    if (count === 0) {
      setTimeout(() => {
        this.requestCounts.delete(url);
      }, 3600000);
    }
  }

  /**
   * HTTPヘッダー作成
   */
  createHeaders(accessToken = null, additionalHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'CalendarGapTimeApp/1.0',
      'Accept': 'application/json',
      ...additionalHeaders
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return headers;
  }

  /**
   * リクエスト実行（並行制御あり）
   */
  async executeRequest(url, options = {}) {
    return this.concurrencyManager.execute(async () => {
      return this.fetchWithRetry(url, options);
    });
  }

  /**
   * リトライ機能付きFetch
   */
  async fetchWithRetry(url, options = {}, attempt = 0) {
    const startTime = Date.now();
    Logger.startPerformanceTimer(`api_request_${url}`);
    
    try {
      // Rate Limit チェック
      this.checkRateLimit();
      
      // リクエスト数更新
      this.updateRequestCount(url);
      
      Logger.debug('API Request', { 
        url, 
        method: options.method || 'GET',
        attempt: attempt + 1,
        concurrencyStatus: this.concurrencyManager.getStatus()
      });

      // タイムアウト設定
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(), 
        API_CONSTANTS.REQUEST_TIMEOUT_MS
      );

      // リクエスト実行
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: this.createHeaders(null, options.headers)
      });

      clearTimeout(timeoutId);
      
      // Rate Limit ヘッダー解析
      this.parseRateLimitHeaders(response);

      if (!response.ok) {
        await this.handleErrorResponse(response, url, options, attempt);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;
      
      Logger.endPerformanceTimer(`api_request_${url}`);
      Logger.info('API Request Success', { 
        url, 
        status: response.status,
        duration: `${duration}ms`,
        dataSize: JSON.stringify(data).length
      });

      return data;

    } catch (error) {
      Logger.endPerformanceTimer(`api_request_${url}`);
      
      if (this.shouldRetry(error, attempt)) {
        const delay = this.calculateBackoffDelay(attempt);
        
        Logger.warn('API Request Failed - Retrying', { 
          url, 
          attempt: attempt + 1,
          maxAttempts: API_CONSTANTS.MAX_RETRY_ATTEMPTS,
          delay: `${delay}ms`,
          error: error.message
        });

        await this.sleep(delay);
        return this.fetchWithRetry(url, options, attempt + 1);
      }

      Logger.error('API Request Failed - Max Retries Exceeded', error, { 
        url, 
        totalAttempts: attempt + 1,
        duration: `${Date.now() - startTime}ms`
      });

      throw this.normalizeError(error);
    }
  }

  /**
   * Rate Limit ヘッダー解析
   */
  parseRateLimitHeaders(response) {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');
    const retryAfter = response.headers.get('Retry-After');

    if (retryAfter) {
      this.rateLimitResetTime = Date.now() + (parseInt(retryAfter) * 1000);
    } else if (reset) {
      this.rateLimitResetTime = parseInt(reset) * 1000;
    }

    Logger.debug('Rate Limit Info', { 
      remaining, 
      reset, 
      retryAfter,
      resetTime: this.rateLimitResetTime 
    });
  }

  /**
   * エラーレスポンス処理
   */
  async handleErrorResponse(response, url, options, attempt) {
    const errorData = await response.json().catch(() => ({}));
    
    if (response.status === 429) {
      // Rate Limit エラー
      const retryAfter = response.headers.get('Retry-After') || '60';
      this.rateLimitResetTime = Date.now() + (parseInt(retryAfter) * 1000);
      
      throw new ApiError(
        ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
        429,
        errorData,
        true
      );
    }

    if (response.status === 403 && errorData.error?.message?.includes('quota')) {
      // Quota Exceeded エラー
      throw new ApiError(
        ERROR_MESSAGES.QUOTA_EXCEEDED,
        403,
        errorData,
        true
      );
    }

    throw new ApiError(
      errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      errorData
    );
  }

  /**
   * リトライ判定
   */
  shouldRetry(error, attempt) {
    if (attempt >= API_CONSTANTS.MAX_RETRY_ATTEMPTS - 1) {
      return false;
    }

    // Rate Limit エラーは長時間待機が必要なのでリトライしない
    if (error instanceof ApiError && error.isRateLimited()) {
      return false;
    }

    // 認証エラーはリトライしない
    if (error instanceof ApiError && error.isAuthError()) {
      return false;
    }

    // 一時的なエラーのみリトライ
    return error instanceof ApiError ? error.isTemporary() : true;
  }

  /**
   * エラー正規化
   */
  normalizeError(error) {
    if (error instanceof ApiError) {
      return error;
    }

    if (error.name === 'AbortError') {
      return new ApiError(ERROR_MESSAGES.TIMEOUT_ERROR, 408);
    }

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new ApiError(ERROR_MESSAGES.NETWORK_ERROR, 0);
    }

    return new ApiError(error.message || ERROR_MESSAGES.NETWORK_ERROR);
  }

  /**
   * スリープ関数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 認証付きAPIリクエスト
   */
  async authenticatedRequest(url, accessToken, options = {}) {
    if (!accessToken) {
      throw new ApiError(ERROR_MESSAGES.AUTH_FAILED, 401);
    }

    const requestOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`
      }
    };

    return this.executeRequest(url, requestOptions);
  }

  /**
   * キャッシュ付きGETリクエスト
   */
  async getCached(url, options = {}) {
    // キャッシュ確認
    const cached = this.cache.get(url, options);
    if (cached) {
      return cached;
    }

    // APIリクエスト
    const data = await this.executeRequest(url, options);
    
    // キャッシュ保存（GETリクエストのみ）
    if (!options.method || options.method === 'GET') {
      this.cache.set(url, options, data);
    }

    return data;
  }

  /**
   * バッチリクエスト処理
   */
  async batchRequest(requests) {
    const batches = [];
    for (let i = 0; i < requests.length; i += API_CONSTANTS.BATCH_SIZE) {
      batches.push(requests.slice(i, i + API_CONSTANTS.BATCH_SIZE));
    }

    const results = [];
    for (const batch of batches) {
      const batchPromises = batch.map(req => 
        this.executeRequest(req.url, req.options).catch(error => ({ error }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // バッチ間の待機（Rate Limit対策）
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.sleep(1000);
      }
    }

    return results;
  }

  /**
   * 統計情報取得
   */
  getStats() {
    return {
      cacheSize: this.cache.cache.size,
      requestCounts: Object.fromEntries(this.requestCounts),
      rateLimitResetTime: this.rateLimitResetTime,
      concurrencyStatus: this.concurrencyManager.getStatus(),
      performanceStats: Logger.getPerformanceStats()
    };
  }

  /**
   * リセット（テスト用）
   */
  reset() {
    this.cache.clear();
    this.requestCounts.clear();
    this.rateLimitResetTime = null;
    Logger.info('API Service reset');
  }
}

// シングルトンインスタンス
const ApiService = new ApiServiceClass();

export default ApiService; 