/**
 * カレンダー空き時間検索アプリ - メインコンポーネント
 * 完全リファクタリング版：モジュール化、セキュリティ強化、パフォーマンス改善
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Grid,
  Chip,
  IconButton,
  TextField,
  List,
  ListItem,
  ListItemText,
  Paper
} from '@mui/material';
import { styled } from '@mui/material/styles';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import 'dayjs/locale/ja';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';

// 内部モジュールインポート
import { 
  TIME_CONSTANTS,
  ERROR_MESSAGES,
  THEME_COLORS,
  getConfig
} from './config/constants.js';
import { Validator } from './utils/validation.js';
import Logger from './utils/logger.js';
import ApiService, { ApiError } from './services/apiService.js';

// dayjs日本語ロケール設定
dayjs.locale('ja');
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

// スタイル付きコンポーネント
const StyledCard = styled(Card)(({ theme }) => ({
  background: THEME_COLORS.CARD_GRADIENT,
  backdropFilter: 'blur(10px)',
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 12px 48px rgba(0, 0, 0, 0.15)',
  }
}));

const CalendarGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: theme.spacing(1),
  marginTop: theme.spacing(2),
}));

const CalendarDay = styled(Paper)(({ theme, isSelected, isInRange, isToday }) => ({
  padding: theme.spacing(1),
  textAlign: 'center',
  cursor: 'pointer',
  minHeight: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  transition: 'all 0.2s ease',
  backgroundColor: isSelected 
    ? theme.palette.primary.main 
    : isInRange 
    ? theme.palette.primary.light 
    : isToday 
    ? theme.palette.secondary.light
    : theme.palette.background.paper,
  color: isSelected || isInRange 
    ? theme.palette.primary.contrastText 
    : isToday
    ? theme.palette.secondary.contrastText
    : theme.palette.text.primary,
  '&:hover': {
    backgroundColor: isSelected 
      ? theme.palette.primary.dark 
      : theme.palette.primary.light,
    color: theme.palette.primary.contrastText,
    transform: 'scale(1.05)',
  }
}));

/**
 * 日付・時間ユーティリティ（最適化版）
 */
const DateTimeUtils = {
  /**
   * 日付範囲生成（メモ化対応）
   */
  generateDateRange: (startDate, endDate) => {
    const dates = [];
    let currentDate = startDate.clone();
    
    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
      dates.push(currentDate.clone());
      currentDate = currentDate.add(1, 'day');
    }
    
    return dates;
  },

  /**
   * 連続する時間スロットのマージ（最適化版）
   */
  mergeContinuousSlots: (slots) => {
    if (!Array.isArray(slots) || slots.length === 0) return [];
    
    // ソート
    const sortedSlots = [...slots].sort((a, b) => 
      a.startTime.localeCompare(b.startTime)
    );
    
    const mergedSlots = [];
    let currentSlot = { ...sortedSlots[0] };
    
    for (let i = 1; i < sortedSlots.length; i++) {
      const prevEndTime = dayjs(`2000-01-01 ${currentSlot.endTime}`);
      const currentStartTime = dayjs(`2000-01-01 ${sortedSlots[i].startTime}`);
      
      // 連続または重複している場合はマージ
      if (prevEndTime.isSameOrAfter(currentStartTime)) {
        const currentEndTime = dayjs(`2000-01-01 ${currentSlot.endTime}`);
        const nextEndTime = dayjs(`2000-01-01 ${sortedSlots[i].endTime}`);
        
        currentSlot.endTime = currentEndTime.isAfter(nextEndTime) 
          ? currentSlot.endTime 
          : sortedSlots[i].endTime;
        currentSlot.isContinuous = true;
      } else {
        mergedSlots.push(currentSlot);
        currentSlot = { ...sortedSlots[i] };
      }
    }
    
    mergedSlots.push(currentSlot);
    return mergedSlots;
  },

  /**
   * フォーマット統一
   */
  formatDate: (date) => date.format('YYYY-MM-DD'),
  formatDisplayDate: (date) => date.format('M月D日(ddd)'),
  parseDate: (dateString) => dayjs(dateString)
};

/**
 * カレンダーサービス（Rate Limit対応版）
 */
const CalendarService = {
  /**
   * 全カレンダーの予定を取得（エラーハンドリング強化）
   */
  async fetchAllCalendarEvents(accessToken, startDate, endDate) {
    Logger.startPerformanceTimer('calendar_fetch_all');
    
    try {
      Logger.info('Fetching calendar events', { 
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD')
      });
      
      // カレンダー一覧取得
      const calendarsData = await ApiService.authenticatedRequest(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        accessToken
      );
      console.log('取得カレンダー一覧:', calendarsData.items?.map(c => ({ id: c.id, summary: c.summary })));
      
      if (!calendarsData.items || calendarsData.items.length === 0) {
        Logger.warn('No calendars found');
        return [];
      }
      
      Logger.info(`Found ${calendarsData.items.length} calendars`);

      // 各カレンダーから予定を取得（バッチ処理）
      const eventRequests = calendarsData.items.map(calendar => ({
        url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?` +
             `timeMin=${startDate.toISOString()}` +
             `&timeMax=${endDate.toISOString()}` +
             `&singleEvents=true` +
             `&orderBy=startTime` +
             `&maxResults=250`,
        options: {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      }));

      const results = await ApiService.batchRequest(eventRequests);
      
      // デバッグ: 各カレンダーごとの予定件数・エラー内容を出力
      results.forEach((result, idx) => {
        const cal = calendarsData.items[idx];
        if (result.error) {
          console.error(`カレンダー: ${cal?.summary || cal?.id} でエラー`, result.error);
        } else {
          console.log(`カレンダー: ${cal?.summary || cal?.id}, 予定件数:`, result.items?.length, result.items?.map(e => e.summary));
        }
      });
      
      // 成功したリクエストからイベントを抽出
      const allEvents = results
        .filter(result => !result.error)
        .flatMap(result => result.items || [])
        .filter(event => event.start && event.start.dateTime);
      
      const errorCount = results.filter(result => result.error).length;
      if (errorCount > 0) {
        Logger.warn(`${errorCount} calendar requests failed`);
      }
      
      Logger.endPerformanceTimer('calendar_fetch_all');
      Logger.info(`Total events fetched: ${allEvents.length}`);
      
      return allEvents;
      
    } catch (error) {
      Logger.endPerformanceTimer('calendar_fetch_all');
      
      if (error instanceof ApiError && error.isRateLimited()) {
        throw new Error(`${ERROR_MESSAGES.RATE_LIMIT_EXCEEDED}\n\n⏱️ Google Calendar APIの使用制限に達しました。\n📅 しばらく時間をおいてから再試行してください。`);
      }
      
      Logger.error('Failed to fetch calendar events', error);
      throw new Error(`${ERROR_MESSAGES.CALENDAR_FETCH_FAILED}: ${error.message}`);
    }
  },

  /**
   * 空き時間計算（希望時間帯ベース対応）
   */
  calculateAvailableSlots(events, startDate, endDate, timeSlots) {
    Logger.startPerformanceTimer('calculate_slots');
    try {
      let dates;
      if (timeSlots.length > 0) {
        // 希望時間帯がある場合は、その日付だけ
        const uniqueDates = [...new Set(timeSlots.map(slot => slot.date))];
        dates = uniqueDates.map(dateStr => dayjs(dateStr));
      } else {
        // 希望時間帯がなければ希望期間全体
        dates = DateTimeUtils.generateDateRange(startDate, endDate);
      }
      const availableSlots = [];
      dates.forEach(date => {
        const dateStr = date.format('YYYY-MM-DD');
        const slotsForDate = timeSlots.filter(slot => slot.date === dateStr);
        const daySlots = this.calculateDayAvailableSlots(events, date, slotsForDate);
        if (daySlots.length > 0) {
          const mergedSlots = DateTimeUtils.mergeContinuousSlots(daySlots);
          availableSlots.push({
            date: DateTimeUtils.formatDate(date),
            dateFormatted: DateTimeUtils.formatDisplayDate(date),
            slots: mergedSlots,
            totalSlots: mergedSlots.length,
            totalMinutes: mergedSlots.reduce((sum, slot) => {
              const start = dayjs(`2000-01-01 ${slot.startTime}`);
              const end = dayjs(`2000-01-01 ${slot.endTime}`);
              return sum + end.diff(start, 'minute');
            }, 0)
          });
        }
      });
      Logger.endPerformanceTimer('calculate_slots');
      Logger.info(`Available slots calculated for ${availableSlots.length} days`);
      return availableSlots;
    } catch (error) {
      Logger.endPerformanceTimer('calculate_slots');
      Logger.error('Failed to calculate available slots', error);
      throw error;
    }
  },

  /**
   * 1日の空き時間計算（希望時間帯ベース対応）
   */
  calculateDayAvailableSlots(events, date, slotsForDate) {
    console.log('=== calculateDayAvailableSlots: 希望日:', date.format('YYYY-MM-DD'), '希望時間帯:', slotsForDate);
    // その日の予定を抽出・ソート（終日イベントも考慮）
    const dayEvents = events
      .filter(event => {
        const targetDate = date.format('YYYY-MM-DD');
        // 終日イベント
        if (event.start?.date) {
          return event.start.date === targetDate;
        }
        // 通常イベント（日付部分だけで比較）
        if (event.start?.dateTime) {
          const eventDate = event.start.dateTime.split('T')[0];
          return eventDate === targetDate;
        }
        return false;
      })
      .map(event => {
        if (event.start?.date && event.end?.date) {
          // 終日イベント（Googleカレンダーの仕様でend.dateは翌日になることが多い）
          const start = dayjs(event.start.date).startOf('day');
          const end = dayjs(event.end.date).subtract(1, 'day').endOf('day');
          return { start, end };
        } else {
          // 通常イベント
          return {
            start: dayjs(event.start.dateTime).subtract(TIME_CONSTANTS.BUFFER_TIME_MINUTES, 'minute'),
            end: dayjs(event.end.dateTime).add(TIME_CONSTANTS.BUFFER_TIME_MINUTES, 'minute')
          };
        }
      })
      .sort((a, b) => a.start.diff(b.start));
    console.log('=== dayEvents for', date.format('YYYY-MM-DD'), '===', dayEvents);

    // 希望時間帯がなければコアタイム全体
    const slotRanges = (slotsForDate.length > 0)
      ? slotsForDate.map(slot => ({
          start: dayjs(`${date.format('YYYY-MM-DD')}T${slot.start}`),
          end: dayjs(`${date.format('YYYY-MM-DD')}T${slot.end}`)
        }))
      : [{
          start: date.hour(TIME_CONSTANTS.CORE_TIME_START_HOUR).minute(0).second(0),
          end: date.hour(TIME_CONSTANTS.CORE_TIME_END_HOUR).minute(0).second(0)
        }];

    // 各希望時間帯ごとに空き時間を計算
    const slots = [];
    for (const range of slotRanges) {
      let currentTime = range.start;
      // 予定で埋まっていない部分を空きとして抽出
      for (const event of dayEvents) {
        if (event.end.isBefore(currentTime)) continue;
        if (event.start.isAfter(range.end)) break;
        if (currentTime.isBefore(event.start)) {
          const slotEnd = event.start.isBefore(range.end) ? event.start : range.end;
          if (slotEnd.diff(currentTime, 'minute') >= TIME_CONSTANTS.MIN_SLOT_DURATION) {
            slots.push({
              startTime: currentTime.format('HH:mm'),
              endTime: slotEnd.format('HH:mm')
            });
          }
        }
        currentTime = event.end.isAfter(currentTime) ? event.end : currentTime;
        if (currentTime.isAfter(range.end)) break;
      }
      // 最後の予定以降の空き
      if (currentTime.isBefore(range.end)) {
        if (range.end.diff(currentTime, 'minute') >= TIME_CONSTANTS.MIN_SLOT_DURATION) {
          slots.push({
            startTime: currentTime.format('HH:mm'),
            endTime: range.end.format('HH:mm')
          });
        }
      }
    }
    return slots;
  }
};

function loadGoogleScript() {
  if (document.getElementById('google-apis')) return;
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.id = 'google-apis';
  document.body.appendChild(script);
}

/**
 * メインアプリコンポーネント（完全リファクタリング版）
 */
function CalendarGapTimeApp() {
  const [startDate, setStartDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().add(6, 'day').format('YYYY-MM-DD'));
  const [timeSlot, setTimeSlot] = useState({ date: '', start: '10:00', end: '22:00' });
  const [timeSlots, setTimeSlots] = useState([]);
  const [searchResult, setSearchResult] = useState(null);
  const [googleToken, setGoogleToken] = useState(null);

  // 10分刻みの時刻リスト生成（例: 00:00, 00:10, ... 23:50）
  const timeOptions = useMemo(() => {
    const options = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 10) {
        const hh = h.toString().padStart(2, '0');
        const mm = m.toString().padStart(2, '0');
        options.push(`${hh}:${mm}`);
      }
    }
    return options;
  }, []);

  // Google認証フロー本実装
  const handleGoogleLogin = useCallback(() => {
    const { clientId } = getConfig();
    loadGoogleScript();
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      setTimeout(handleGoogleLogin, 500); // スクリプトロード待ち
      return;
    }
    window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          setGoogleToken(tokenResponse.access_token);
        } else {
          alert('Google認証に失敗しました');
        }
      },
    }).requestAccessToken();
  }, []);

  const handleSearch = useCallback(async () => {
    console.log('検索ボタンが押されました', googleToken);
    if (!googleToken) {
      handleGoogleLogin();
      return;
    }
    try {
      let events;
      
      if (timeSlots.length > 0) {
        // 希望日が指定されている場合：希望日だけを取得
        console.log('=== 希望日モード：指定された日付のみ取得 ===');
        const allEvents = [];
        
        // 希望日ごとに個別に取得
        const uniqueDates = [...new Set(timeSlots.map(slot => slot.date))];
        for (const targetDate of uniqueDates) {
          console.log(`--- ${targetDate}のイベントを取得中 ---`);
          const dayStart = dayjs(targetDate).startOf('day');
          const dayEnd = dayjs(targetDate).endOf('day');
          const dayEvents = await CalendarService.fetchAllCalendarEvents(googleToken, dayStart, dayEnd);
          allEvents.push(...dayEvents);
        }
        
        events = allEvents;
        console.log(`=== 希望日のイベント取得完了：${events.length}件 ===`);
        
      } else {
        // 希望日がない場合：期間全体を取得
        console.log('=== 期間全体モード：startDate〜endDateを取得 ===');
        events = await CalendarService.fetchAllCalendarEvents(googleToken, dayjs(startDate), dayjs(endDate));
      }
      
      console.log('=== 取得したevents数 ===', events.length);
      
      // 最初の3件を完全に出力
      console.log('=== 最初の3件のイベント詳細（JSON） ===');
      events.slice(0, 3).forEach((e, idx) => {
        console.log(`Event ${idx}:`, JSON.stringify(e, null, 2));
      });
      
      // start/endの値だけを抽出して確認
      console.log('=== 全eventsのstart/end一覧 ===');
      events.forEach((e, idx) => {
        console.log(`Event ${idx}: summary="${e.summary}", start=${JSON.stringify(e.start)}, end=${JSON.stringify(e.end)}`);
      });
      
      // 希望日ごとにeventsをフィルタして出力
      if (timeSlots.length > 0) {
        timeSlots.forEach(slot => {
          const targetDate = slot.date;
          console.log(`=== 希望日(${targetDate})でフィルタリング ===`);
          
          const filtered = events.filter((e, idx) => {
            // デバッグ用に各イベントの判定結果を出力
            const eventDateFromDateTime = e.start?.dateTime ? e.start.dateTime.split('T')[0] : null;
            const eventDateFromDate = e.start?.date;
            const eventDate = eventDateFromDateTime || eventDateFromDate;
            const isMatch = eventDate === targetDate;
            
            if (idx < 3 || isMatch) { // 最初の3件またはマッチした場合は詳細出力
              console.log(`  - "${e.summary}": eventDate=${eventDate}, targetDate=${targetDate}, match=${isMatch}`);
            }
            
            return isMatch;
          });
          console.log(`=== 希望日(${targetDate})のevents ===`, filtered.length, '件');
        });
      }
      // 希望日が入力されていれば希望日だけ、なければ希望期間全体を検索
      let availableSlots;
      if (timeSlots.length > 0) {
        availableSlots = CalendarService.calculateAvailableSlots(events, dayjs(startDate), dayjs(endDate), timeSlots);
      } else {
        availableSlots = CalendarService.calculateAvailableSlots(events, dayjs(startDate), dayjs(endDate), []);
      }
      console.log('空き時間日数:', availableSlots.length, availableSlots);
      const resultList = availableSlots.map(day => ({
        date: day.date,
        dateDisplay: dayjs(day.date).format('YYYY/MM/DD (ddd)'),
        slots: day.slots
      }));
      setSearchResult(resultList);
    } catch (e) {
      alert('Googleカレンダーから予定の取得または空き時間計算に失敗しました: ' + (e.message || e));
      setSearchResult([]);
      console.error(e);
    }
  }, [startDate, endDate, timeSlots, googleToken, handleGoogleLogin]);

  // 希望時間帯を日付ごとにグループ化
  const groupedTimeSlots = useMemo(() => {
    const map = {};
    timeSlots.forEach(slot => {
      if (!map[slot.date]) map[slot.date] = [];
      map[slot.date].push(`${slot.start}〜${slot.end}`);
    });
    return map;
  }, [timeSlots]);

  // 希望期間の日付リストを生成（1週間ごとに分割）
  const weekDateList = useMemo(() => {
    const list = [];
    let d = dayjs(startDate);
    const end = dayjs(endDate);
    let week = [];
    while (d.isSameOrBefore(end, 'day')) {
      week.push(d.format('YYYY-MM-DD'));
      if (d.day() === 6) { // 土曜で改行
        list.push(week);
        week = [];
      }
      d = d.add(1, 'day');
    }
    if (week.length > 0) list.push(week);
    return list;
  }, [startDate, endDate]);

  // カレンダーのカスタム描画
  const renderDay = (date, _selectedDates, pickersDayProps) => {
    const dStr = date.format('YYYY-MM-DD');
    const isStart = date.isSame(dayjs(startDate), 'day');
    const isEnd = date.isSame(dayjs(endDate), 'day');
    const inRange = date.isAfter(dayjs(startDate).subtract(1, 'day')) && date.isBefore(dayjs(endDate).add(1, 'day'));
    const hasTimeSlot = groupedTimeSlots[dStr];

    let backgroundColor = undefined;
    let color = undefined;
    let borderRadius = undefined;

    if (hasTimeSlot) {
      backgroundColor = '#1976d2';
      color = '#fff';
      borderRadius = '50%';
    } else if (inRange) {
      backgroundColor = '#e3f2fd';
      color = '#1976d2';
      // 帯の端だけ角丸
      if (isStart && isEnd) {
        borderRadius = '16px';
      } else if (isStart) {
        borderRadius = '16px 0 0 16px';
      } else if (isEnd) {
        borderRadius = '0 16px 16px 0';
      } else {
        borderRadius = '0';
      }
    }

    return (
      <PickersDay
        {...pickersDayProps}
        sx={{
          backgroundColor,
          color,
          borderRadius,
          border: hasTimeSlot ? '2px solid #1976d2' : undefined,
        }}
        disableMargin
      />
    );
  };

  return (
    <Container maxWidth="sm" sx={{ background: '#fff', minHeight: '100vh', py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
        🗓️ カレンダー空き時間検索
      </Typography>
      <Typography variant="subtitle1" gutterBottom fontWeight={600}>
        希望期間
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          label="開始日"
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="終了日"
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Box>

      <Typography variant="subtitle1" gutterBottom fontWeight={600}>
        希望時間帯の追加
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          label="日付"
          type="date"
          value={timeSlot.date}
          onChange={e => setTimeSlot({ ...timeSlot, date: e.target.value })}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="開始時刻"
          select
          value={timeSlot.start}
          onChange={e => setTimeSlot({ ...timeSlot, start: e.target.value })}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ native: true }}
        >
          <option value=""></option>
          {timeOptions.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </TextField>
        <TextField
          label="終了時刻"
          select
          value={timeSlot.end}
          onChange={e => setTimeSlot({ ...timeSlot, end: e.target.value })}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ native: true }}
        >
          <option value=""></option>
          {timeOptions.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </TextField>
        <Button
          variant="contained"
          onClick={() => {
            if (timeSlot.date && timeSlot.start && timeSlot.end) {
              setTimeSlots([...timeSlots, timeSlot]);
              setTimeSlot({ date: '', start: '10:00', end: '22:00' });
            }
          }}
        >
          追加
        </Button>
      </Box>
      {/* 希望時間帯リスト（見やすいカードUIに改善） */}
      <List sx={{ mb: 2 }}>
        {timeSlots.map((slot, idx) => (
          <Card key={idx} variant="outlined" sx={{ mb: 1, p: 1, display: 'flex', alignItems: 'center', boxShadow: 1 }}>
            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body1" fontWeight={600}>
                {dayjs(slot.date).format('YYYY/MM/DD (ddd)')}
              </Typography>
              <Chip label={`${slot.start}〜${slot.end}`} color="primary" sx={{ fontWeight: 600, fontSize: '1rem' }} />
            </Box>
            <IconButton edge="end" aria-label="delete" onClick={() => setTimeSlots(timeSlots.filter((_, i) => i !== idx))}>
              <DeleteIcon />
            </IconButton>
          </Card>
        ))}
      </List>
      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          startIcon={<SearchIcon />}
          onClick={handleSearch}
        >
          空き時間を検索
        </Button>
      </Box>
      {searchResult !== null && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" color="primary" align="center">
            検索結果
          </Typography>
          <Box sx={{ mt: 1, textAlign: 'center' }}>
            <Typography variant="body2" color="textSecondary">
              検索条件：{startDate}〜{endDate}
            </Typography>
            {timeSlots.length > 0 ? (
              <Box sx={{ display: 'inline-block', mt: 1, textAlign: 'left' }}>
                <Typography variant="body2" color="textSecondary" fontWeight={600}>
                  希望時間帯：
                </Typography>
                {Object.entries(groupedTimeSlots).map(([date, times]) => (
                  <Typography key={date} variant="body2" color="textSecondary" sx={{ ml: 2 }}>
                    {dayjs(date).format('YYYY/MM/DD (ddd)')}：{times.join(' / ')}
                  </Typography>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="textSecondary">
                希望時間帯：指定なし（10:00〜22:00）
              </Typography>
            )}
          </Box>
          {/* 空き時間リストアップ（MUI Card/Listで日付・曜日・希望時間帯ごとにグループ化） */}
          <Box sx={{ mt: 2, textAlign: 'left', maxWidth: 500, mx: 'auto' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              見つかった空き時間リスト
            </Typography>
            {searchResult.length === 0 ? (
              <Typography color="textSecondary">空き時間が見つかりませんでした。</Typography>
            ) : (
              <List>
                {searchResult.map(({ date, dateDisplay, slots }) => (
                  <Card key={date} variant="outlined" sx={{ mb: 2, background: '#f8fafc' }}>
                    <CardContent>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {dateDisplay}
                      </Typography>
                      {slots.length === 0 ? (
                        <Typography color="textSecondary" sx={{ ml: 2 }}>
                          （空き時間なし）
                        </Typography>
                      ) : (
                        <List dense>
                          {slots.map((slot, idx) => (
                            <ListItem key={idx} sx={{ pl: 2 }}>
                              <Chip label={`${slot.startTime}〜${slot.endTime}`} color="primary" variant="outlined" sx={{ fontWeight: 600, fontSize: '1rem' }} />
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </List>
            )}
          </Box>
        </Box>
      )}
    </Container>
  );
}

export default CalendarGapTimeApp; 