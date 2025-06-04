/**
 * モックデータサービス
 * Rate Limit対応・開発環境での動作確認用
 */

import dayjs from 'dayjs';
import { TIME_CONSTANTS } from '../config/constants.js';
import Logger from '../utils/logger.js';

/**
 * モックカレンダーイベント生成
 */
const generateMockEvents = (startDate, endDate) => {
  const events = [];
  const dates = [];
  
  // 日付範囲を生成
  let currentDate = startDate.clone();
  while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
    dates.push(currentDate.clone());
    currentDate = currentDate.add(1, 'day');
  }
  
  // 各日にランダムなイベントを生成
  dates.forEach(date => {
    const eventCount = Math.floor(Math.random() * 4) + 1; // 1-4個のイベント
    
    for (let i = 0; i < eventCount; i++) {
      const startHour = Math.floor(Math.random() * 8) + 9; // 9-16時
      const duration = Math.floor(Math.random() * 3) + 1; // 1-3時間
      
      const eventStart = date.hour(startHour).minute(0).second(0);
      const eventEnd = eventStart.add(duration, 'hour');
      
      // コアタイム内のイベントのみ追加
      if (eventStart.hour() >= TIME_CONSTANTS.CORE_TIME_START_HOUR && 
          eventEnd.hour() <= TIME_CONSTANTS.CORE_TIME_END_HOUR) {
        events.push({
          id: `mock_event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          summary: mockEventTitles[Math.floor(Math.random() * mockEventTitles.length)],
          start: {
            dateTime: eventStart.toISOString()
          },
          end: {
            dateTime: eventEnd.toISOString()
          },
          description: 'モックイベント（開発用）',
          location: mockLocations[Math.floor(Math.random() * mockLocations.length)]
        });
      }
    }
  });
  
  return events.sort((a, b) => 
    dayjs(a.start.dateTime).diff(dayjs(b.start.dateTime))
  );
};

/**
 * モックイベントタイトル
 */
const mockEventTitles = [
  '定例会議',
  'プロジェクト打ち合わせ',
  'クライアントミーティング',
  '企画会議',
  '進捗確認',
  'チームミーティング',
  '研修',
  'プレゼンテーション',
  '顧客対応',
  '設計レビュー',
  'コードレビュー',
  '要件定義会議',
  '設計ミーティング',
  'テストレビュー',
  'リリース会議',
  '月次報告',
  '四半期レビュー',
  '1on1ミーティング',
  'ブレインストーミング',
  'ワークショップ'
];

/**
 * モック場所
 */
const mockLocations = [
  '会議室A',
  '会議室B',
  '会議室C',
  'オンライン',
  'Zoom',
  'Teams',
  '応接室',
  '役員会議室',
  '打ち合わせスペース',
  '執務室',
  '客先',
  '本社',
  '支社',
  'カフェテリア',
  '研修室'
];

/**
 * モックカレンダー一覧
 */
const mockCalendars = [
  {
    id: 'primary',
    summary: 'メインカレンダー',
    description: 'プライマリカレンダー',
    timeZone: 'Asia/Tokyo',
    colorId: '1'
  },
  {
    id: 'work_calendar',
    summary: '仕事',
    description: '業務関連のスケジュール',
    timeZone: 'Asia/Tokyo',
    colorId: '2'
  },
  {
    id: 'meeting_calendar',
    summary: '会議',
    description: '会議専用カレンダー',
    timeZone: 'Asia/Tokyo',
    colorId: '3'
  },
  {
    id: 'project_calendar',
    summary: 'プロジェクト',
    description: 'プロジェクト関連',
    timeZone: 'Asia/Tokyo',
    colorId: '4'
  }
];

/**
 * モックデータサービス
 */
class MockDataService {
  constructor() {
    this.isEnabled = process.env.REACT_APP_ENABLE_MOCK_DATA === 'true' || 
                     process.env.NODE_ENV === 'development';
    this.cache = new Map();
    
    Logger.info('Mock Data Service initialized', { 
      enabled: this.isEnabled,
      environment: process.env.NODE_ENV
    });
  }

  /**
   * モック待機時間（APIリクエストのシミュレート）
   */
  async simulateApiDelay(minMs = 500, maxMs = 1500) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * モックカレンダー一覧取得
   */
  async getMockCalendarList() {
    Logger.debug('Fetching mock calendar list');
    
    await this.simulateApiDelay(300, 800);
    
    return {
      items: mockCalendars,
      nextPageToken: null
    };
  }

  /**
   * モックイベント取得
   */
  async getMockEvents(calendarId, startDate, endDate) {
    const cacheKey = `${calendarId}_${startDate.format('YYYY-MM-DD')}_${endDate.format('YYYY-MM-DD')}`;
    
    // キャッシュ確認
    if (this.cache.has(cacheKey)) {
      Logger.debug('Mock events cache hit', { calendarId, cacheKey });
      return this.cache.get(cacheKey);
    }
    
    Logger.debug('Generating mock events', { 
      calendarId, 
      startDate: startDate.format('YYYY-MM-DD'),
      endDate: endDate.format('YYYY-MM-DD')
    });
    
    await this.simulateApiDelay(800, 2000);
    
    // カレンダーによって異なる量のイベントを生成
    let eventMultiplier = 1;
    switch (calendarId) {
      case 'primary':
        eventMultiplier = 1.5;
        break;
      case 'work_calendar':
        eventMultiplier = 1.2;
        break;
      case 'meeting_calendar':
        eventMultiplier = 0.8;
        break;
      case 'project_calendar':
        eventMultiplier = 0.6;
        break;
      default:
        eventMultiplier = 1;
    }
    
    let events = generateMockEvents(startDate, endDate);
    
    // イベント数を調整
    const targetCount = Math.floor(events.length * eventMultiplier);
    if (targetCount < events.length) {
      events = events.slice(0, targetCount);
    }
    
    const result = {
      items: events,
      nextPageToken: null,
      summary: mockCalendars.find(cal => cal.id === calendarId)?.summary || 'Unknown Calendar'
    };
    
    // キャッシュに保存
    this.cache.set(cacheKey, result);
    
    Logger.info(`Generated ${events.length} mock events for ${calendarId}`);
    
    return result;
  }

  /**
   * 全カレンダーのモックイベント取得
   */
  async getAllMockCalendarEvents(startDate, endDate) {
    Logger.startPerformanceTimer('mock_calendar_fetch_all');
    
    try {
      Logger.info('Fetching all mock calendar events', {
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD')
      });
      
      // カレンダー一覧取得
      const calendarsData = await this.getMockCalendarList();
      
      Logger.info(`Found ${calendarsData.items.length} mock calendars`);
      
      // 各カレンダーからイベント取得（並列処理）
      const eventPromises = calendarsData.items.map(calendar =>
        this.getMockEvents(calendar.id, startDate, endDate)
          .then(events => ({
            calendar: calendar.summary,
            events: events.items || []
          }))
          .catch(error => {
            Logger.warn(`Failed to fetch mock events for ${calendar.summary}`, error);
            return { calendar: calendar.summary, events: [] };
          })
      );
      
      const results = await Promise.all(eventPromises);
      
      // 全イベントを統合
      const allEvents = results
        .flatMap(result => result.events)
        .filter(event => event.start && event.start.dateTime)
        .sort((a, b) => 
          dayjs(a.start.dateTime).diff(dayjs(b.start.dateTime))
        );
      
      Logger.endPerformanceTimer('mock_calendar_fetch_all');
      Logger.info(`Total mock events fetched: ${allEvents.length}`);
      
      return allEvents;
      
    } catch (error) {
      Logger.endPerformanceTimer('mock_calendar_fetch_all');
      Logger.error('Failed to fetch mock calendar events', error);
      throw error;
    }
  }

  /**
   * Rate Limitエラーのシミュレート
   */
  async simulateRateLimit() {
    const shouldFail = Math.random() < 0.1; // 10%の確率でRate Limitエラー
    
    if (shouldFail) {
      Logger.warn('Simulating rate limit error');
      throw new Error('Rate limit exceeded (simulated)');
    }
  }

  /**
   * モックデータ有効性チェック
   */
  isEnabled() {
    return this.isEnabled;
  }

  /**
   * キャッシュクリア
   */
  clearCache() {
    this.cache.clear();
    Logger.info('Mock data cache cleared');
  }

  /**
   * 統計情報取得
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      totalCalendars: mockCalendars.length,
      eventTitleVariations: mockEventTitles.length,
      locationVariations: mockLocations.length,
      isEnabled: this.isEnabled
    };
  }

  /**
   * エラー率設定（テスト用）
   */
  setErrorRate(rate) {
    this.errorRate = Math.max(0, Math.min(1, rate));
    Logger.info(`Mock error rate set to ${this.errorRate * 100}%`);
  }

  /**
   * モックデータの品質向上
   */
  generateRealisticEvents(startDate, endDate) {
    const events = [];
    const businessDays = [];
    
    // 営業日のみを抽出
    let currentDate = startDate.clone();
    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
      if (currentDate.day() >= 1 && currentDate.day() <= 5) { // 月-金
        businessDays.push(currentDate.clone());
      }
      currentDate = currentDate.add(1, 'day');
    }
    
    // よりリアルなスケジュールパターンを生成
    businessDays.forEach(date => {
      // 朝の会議
      if (Math.random() < 0.3) {
        const start = date.hour(9).minute(0);
        events.push(this.createMockEvent(start, start.add(1, 'hour'), '朝会'));
      }
      
      // 午前中の作業
      if (Math.random() < 0.6) {
        const start = date.hour(10).minute(0);
        events.push(this.createMockEvent(start, start.add(2, 'hour'), '企画会議'));
      }
      
      // 昼休み後の会議
      if (Math.random() < 0.4) {
        const start = date.hour(13).minute(30);
        events.push(this.createMockEvent(start, start.add(1.5, 'hour'), 'クライアントミーティング'));
      }
      
      // 夕方の会議
      if (Math.random() < 0.3) {
        const start = date.hour(16).minute(0);
        events.push(this.createMockEvent(start, start.add(1, 'hour'), '進捗確認'));
      }
    });
    
    return events;
  }

  /**
   * モックイベント作成ヘルパー
   */
  createMockEvent(startTime, endTime, summary) {
    return {
      id: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      summary,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      description: `モックイベント: ${summary}`,
      location: mockLocations[Math.floor(Math.random() * mockLocations.length)]
    };
  }
}

// シングルトンインスタンス
const mockDataService = new MockDataService();

export default mockDataService; 