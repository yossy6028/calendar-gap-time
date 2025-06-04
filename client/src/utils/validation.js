/**
 * バリデーションユーティリティ
 * 全ての入力値検証とセキュリティチェックを担当
 */

import dayjs from 'dayjs';
import { VALIDATION_RULES } from '../config/constants.js';

/**
 * カスタムバリデーションエラークラス
 */
export class ValidationError extends Error {
  constructor(message, field = null, value = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 共通バリデーションヘルパー
 */
const ValidationHelpers = {
  /**
   * 必須チェック
   */
  isRequired: (value, fieldName) => {
    if (value === null || value === undefined || value === '') {
      throw new ValidationError(`${fieldName}は必須入力です`, fieldName, value);
    }
    return true;
  },

  /**
   * 文字列の長さチェック
   */
  checkStringLength: (value, min = 0, max = Infinity, fieldName = 'フィールド') => {
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName}は文字列である必要があります`, fieldName, value);
    }
    if (value.length < min || value.length > max) {
      throw new ValidationError(
        `${fieldName}は${min}文字以上${max}文字以下で入力してください`,
        fieldName,
        value
      );
    }
    return true;
  },

  /**
   * 数値範囲チェック
   */
  checkNumberRange: (value, min = -Infinity, max = Infinity, fieldName = 'フィールド') => {
    const num = Number(value);
    if (isNaN(num)) {
      throw new ValidationError(`${fieldName}は数値である必要があります`, fieldName, value);
    }
    if (num < min || num > max) {
      throw new ValidationError(
        `${fieldName}は${min}以上${max}以下で入力してください`,
        fieldName,
        value
      );
    }
    return true;
  },

  /**
   * 正規表現マッチチェック
   */
  checkRegexMatch: (value, regex, fieldName = 'フィールド', errorMessage = null) => {
    if (!regex.test(value)) {
      const message = errorMessage || `${fieldName}の形式が正しくありません`;
      throw new ValidationError(message, fieldName, value);
    }
    return true;
  },

  /**
   * SQLインジェクション対策チェック
   */
  checkSqlInjection: (value, fieldName = 'フィールド') => {
    const sqlPatterns = [
      /(\b(select|insert|update|delete|drop|union|exec|execute)\b)/i,
      /(--|\/\*|\*\/|;)/,
      /(\b(or|and)\s+\d+\s*=\s*\d+)/i,
      /('|(\\x27)|(\\x2D\\x2D))/
    ];
    
    for (const pattern of sqlPatterns) {
      if (pattern.test(value)) {
        throw new ValidationError(
          `${fieldName}に不正な文字が含まれています`,
          fieldName,
          value
        );
      }
    }
    return true;
  },

  /**
   * XSS対策チェック
   */
  checkXss: (value, fieldName = 'フィールド') => {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<object[^>]*>.*?<\/object>/gi
    ];
    
    for (const pattern of xssPatterns) {
      if (pattern.test(value)) {
        throw new ValidationError(
          `${fieldName}に不正なコードが含まれています`,
          fieldName,
          value
        );
      }
    }
    return true;
  }
};

/**
 * 日付バリデーション
 */
export const DateValidator = {
  /**
   * 日付形式の検証
   */
  validateDateFormat: (dateString, fieldName = '日付') => {
    ValidationHelpers.isRequired(dateString, fieldName);
    
    const date = dayjs(dateString);
    if (!date.isValid()) {
      throw new ValidationError(`${fieldName}の形式が正しくありません`, fieldName, dateString);
    }
    
    return date;
  },

  /**
   * 日付範囲の検証
   */
  validateDateRange: (startDate, endDate) => {
    const start = DateValidator.validateDateFormat(startDate, '開始日');
    const end = DateValidator.validateDateFormat(endDate, '終了日');
    
    if (start.isAfter(end)) {
      throw new ValidationError(
        '開始日は終了日より前の日付を指定してください',
        'dateRange',
        { startDate, endDate }
      );
    }
    
    const diffDays = end.diff(start, 'day');
    if (diffDays > 365) {
      throw new ValidationError(
        '検索期間は1年以内で指定してください',
        'dateRange',
        { startDate, endDate }
      );
    }
    
    return { start, end, diffDays };
  },

  /**
   * 営業日内チェック
   */
  validateBusinessDate: (dateString, fieldName = '日付') => {
    const date = DateValidator.validateDateFormat(dateString, fieldName);
    
    // 過去の日付チェック（当日は許可）
    if (date.isBefore(dayjs(), 'day')) {
      throw new ValidationError(
        `${fieldName}は今日以降の日付を指定してください`,
        fieldName,
        dateString
      );
    }
    
    return date;
  }
};

/**
 * 時間バリデーション
 */
export const TimeValidator = {
  /**
   * 時間形式の検証
   */
  validateTimeFormat: (timeString, fieldName = '時間') => {
    ValidationHelpers.isRequired(timeString, fieldName);
    ValidationHelpers.checkRegexMatch(
      timeString,
      VALIDATION_RULES.TIME.FORMAT,
      fieldName,
      `${fieldName}はHH:mm形式で入力してください`
    );
    
    return timeString;
  },

  /**
   * 時間範囲の検証
   */
  validateTimeRange: (startTime, endTime) => {
    TimeValidator.validateTimeFormat(startTime, '開始時刻');
    TimeValidator.validateTimeFormat(endTime, '終了時刻');
    
    const start = dayjs(`2000-01-01 ${startTime}`);
    const end = dayjs(`2000-01-01 ${endTime}`);
    
    if (start.isAfter(end) || start.isSame(end)) {
      throw new ValidationError(
        '開始時刻は終了時刻より前の時間を指定してください',
        'timeRange',
        { startTime, endTime }
      );
    }
    
    const durationMinutes = end.diff(start, 'minute');
    if (durationMinutes < VALIDATION_RULES.TIME_RANGE.MIN_DURATION_MINUTES) {
      throw new ValidationError(
        `時間帯は${VALIDATION_RULES.TIME_RANGE.MIN_DURATION_MINUTES}分以上で指定してください`,
        'timeRange',
        { startTime, endTime }
      );
    }
    
    if (durationMinutes > VALIDATION_RULES.TIME_RANGE.MAX_DURATION_MINUTES) {
      throw new ValidationError(
        `時間帯は${VALIDATION_RULES.TIME_RANGE.MAX_DURATION_MINUTES}分以下で指定してください`,
        'timeRange',
        { startTime, endTime }
      );
    }
    
    return { startTime, endTime, durationMinutes };
  },

  /**
   * コアタイム内チェック
   */
  validateCoreTime: (startTime, endTime) => {
    const validatedRange = TimeValidator.validateTimeRange(startTime, endTime);
    
    const coreStart = VALIDATION_RULES.TIME_RANGE.CORE_TIME_START;
    const coreEnd = VALIDATION_RULES.TIME_RANGE.CORE_TIME_END;
    
    const start = dayjs(`2000-01-01 ${startTime}`);
    const end = dayjs(`2000-01-01 ${endTime}`);
    const coreStartTime = dayjs(`2000-01-01 ${coreStart}`);
    const coreEndTime = dayjs(`2000-01-01 ${coreEnd}`);
    
    if (start.isBefore(coreStartTime) || end.isAfter(coreEndTime)) {
      throw new ValidationError(
        `時間帯はコアタイム（${coreStart}-${coreEnd}）内で指定してください`,
        'coreTime',
        { startTime, endTime }
      );
    }
    
    return validatedRange;
  }
};

/**
 * 入力値サニタイゼーション
 */
export const Sanitizer = {
  /**
   * 文字列のサニタイズ
   */
  sanitizeString: (value) => {
    if (typeof value !== 'string') return value;
    
    return value
      .trim()
      .replace(/[<>]/g, '') // HTML タグ除去
      .replace(/['"]/g, '') // クォート除去
      .replace(/[&]/g, '&amp;') // アンパサンド エスケープ
      .substring(0, 1000); // 長さ制限
  },

  /**
   * HTMLエスケープ
   */
  escapeHtml: (value) => {
    if (typeof value !== 'string') return value;
    
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    };
    
    return value.replace(/[&<>"'/]/g, (s) => map[s]);
  },

  /**
   * 入力値の完全サニタイズ
   */
  sanitizeInput: (obj) => {
    if (typeof obj === 'string') {
      return Sanitizer.sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => Sanitizer.sanitizeInput(item));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = Sanitizer.sanitizeInput(value);
      }
      return sanitized;
    }
    
    return obj;
  }
};

/**
 * 統合バリデーター
 */
export const Validator = {
  /**
   * 希望時間帯の総合検証
   */
  validateTimeSlot: (timeSlot) => {
    try {
      // 基本的な入力チェック
      if (!timeSlot || typeof timeSlot !== 'object') {
        throw new ValidationError('時間帯データが正しくありません');
      }

      // サニタイズ
      const sanitized = Sanitizer.sanitizeInput(timeSlot);
      
      // セキュリティチェック
      Object.values(sanitized).forEach(value => {
        if (typeof value === 'string') {
          ValidationHelpers.checkSqlInjection(value);
          ValidationHelpers.checkXss(value);
        }
      });

      // 日付検証
      const validDate = DateValidator.validateBusinessDate(sanitized.date);
      
      // 時間検証（コアタイム内）
      const validTimeRange = TimeValidator.validateCoreTime(
        sanitized.startTime,
        sanitized.endTime
      );

      return {
        isValid: true,
        data: {
          date: validDate.format('YYYY-MM-DD'),
          startTime: validTimeRange.startTime,
          endTime: validTimeRange.endTime,
          durationMinutes: validTimeRange.durationMinutes
        }
      };

    } catch (error) {
      return {
        isValid: false,
        error: error.message,
        field: error.field,
        value: error.value
      };
    }
  },

  /**
   * 日付範囲の総合検証
   */
  validateDateRangeInput: (startDate, endDate) => {
    try {
      const validRange = DateValidator.validateDateRange(startDate, endDate);
      
      return {
        isValid: true,
        data: {
          startDate: validRange.start.format('YYYY-MM-DD'),
          endDate: validRange.end.format('YYYY-MM-DD'),
          diffDays: validRange.diffDays
        }
      };

    } catch (error) {
      return {
        isValid: false,
        error: error.message,
        field: error.field,
        value: error.value
      };
    }
  }
}; 