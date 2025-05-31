import logo from './logo.svg';
import './App.css';
import { useGoogleLogin } from '@react-oauth/google';
import { useState, useEffect } from 'react';
import React from 'react';
import { Box, Container, Typography, Paper, Button, TextField, Chip, IconButton, Stack, List, ListItem, Card, CardContent, Divider, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { DateRangePicker } from '@mui/x-date-pickers-pro';
import 'dayjs/locale/ja';
import AddIcon from '@mui/icons-material/Add';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import DeleteIcon from '@mui/icons-material/Delete';
import isBetween from 'dayjs/plugin/isBetween';
dayjs.extend(isBetween);

const SLOT_OPTIONS = [
  { label: '面談（30分）', value: 30 },
  { label: '小4・5授業（70分）', value: 70 },
  { label: '小6授業（80分）', value: 80 },
];

function getTimeSlots(start, end, slotMinutes = 30) {
  const slots = [];
  let current = new Date(start);
  while (current < end) {
    const slotEnd = new Date(current.getTime() + slotMinutes * 60000);
    slots.push({
      start: new Date(current),
      end: new Date(slotEnd),
    });
    current = slotEnd;
  }
  return slots;
}

function isSlotAvailable(slot, events) {
  // 予定の前後10分バッファを考慮
  for (const event of events) {
    const eventStart = new Date(event.start.dateTime || event.start.date);
    const eventEnd = new Date(event.end.dateTime || event.end.date);
    const bufferStart = new Date(eventStart.getTime() - 10 * 60000);
    const bufferEnd = new Date(eventEnd.getTime() + 10 * 60000);
    if (slot.start < bufferEnd && slot.end > bufferStart) {
      return false;
    }
  }
  return true;
}

function mergeSlots(slots, requiredMinutes) {
  // 連続したスロットを結合し、requiredMinutes以上の枠を返す
  const result = [];
  for (let i = 0; i < slots.length; i++) {
    let start = slots[i].start;
    let end = slots[i].end;
    let total = (end - start) / 60000;
    let j = i;
    while (total < requiredMinutes && j + 1 < slots.length && slots[j + 1].start.getTime() === end.getTime()) {
      end = slots[j + 1].end;
      total = (end - start) / 60000;
      j++;
    }
    if (total >= requiredMinutes) {
      result.push({ start, end });
    }
  }
  // 重複を除去
  return result.filter((slot, idx, arr) =>
    arr.findIndex(s => s.start.getTime() === slot.start.getTime() && s.end.getTime() === slot.end.getTime()) === idx
  );
}

function formatDateInput(date) {
  // yyyy-mm-dd 形式
  return date.toISOString().slice(0, 10);
}

// 期間全体のコアタイムスロットを生成
function getAllTimeSlots(startDate, endDate, slotMinutes = 30) {
  const slots = [];
  let current = new Date(startDate);
  current.setHours(10, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(22, 0, 0, 0);
  while (current < end) {
    const slotEnd = new Date(current.getTime() + slotMinutes * 60000);
    // コアタイム外はスキップ
    if (current.getHours() >= 10 && slotEnd.getHours() <= 22 && slotEnd > current) {
      slots.push({ start: new Date(current), end: new Date(slotEnd) });
    }
    // 22:00以降は翌日の10:00に進める
    if (slotEnd.getHours() === 22 && slotEnd.getMinutes() === 0) {
      current.setDate(current.getDate() + 1);
      current.setHours(10, 0, 0, 0);
    } else {
      current = slotEnd;
    }
  }
  return slots;
}

// 連続する空き枠をまとめる
function mergeContinuousSlots(slots) {
  if (slots.length === 0) return [];
  const merged = [];
  let prev = slots[0];
  for (let i = 1; i < slots.length; i++) {
    if (prev.end.getTime() === slots[i].start.getTime()) {
      prev = { start: prev.start, end: slots[i].end };
    } else {
      merged.push(prev);
      prev = slots[i];
    }
  }
  merged.push(prev);
  return merged;
}

// 10:00〜22:00の30分刻み時刻リスト
const timeOptions = [];
for (let h = 10; h <= 21; h++) {
  timeOptions.push(`${h.toString().padStart(2, '0')}:00`);
  timeOptions.push(`${h.toString().padStart(2, '0')}:30`);
}
timeOptions.push('22:00');

function groupSlotsByDate(slots) {
  const grouped = {};
  slots.forEach(slot => {
    const date = dayjs(slot.start).format('YYYY/MM/DD');
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(slot);
  });
  return grouped;
}

function App() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [freeSlots, setFreeSlots] = useState([]);
  const [slotLength, setSlotLength] = useState(30);
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [accessToken, setAccessToken] = useState(null);
  const [dateRange, setDateRange] = useState([
    {
      startDate: dayjs().toDate(),
      endDate: dayjs().add(6, 'day').toDate(),
      key: 'selection',
    },
  ]);
  const [preferredInputs, setPreferredInputs] = useState([]);
  const [timeInputs, setTimeInputs] = useState({}); // 入力中の値
  const [allFreeSlots, setAllFreeSlots] = useState([]);

  // 期間内の日付リスト
  const daysInRange = [];
  let current = dayjs(dateRange[0].startDate);
  const end = dayjs(dateRange[0].endDate);
  while (current.isBefore(end) || current.isSame(end, 'day')) {
    daysInRange.push(current.toDate());
    current = current.add(1, 'day');
  }

  const fetchCalendarEvents = async (accessToken, dateStr) => {
    try {
      const date = new Date(dateStr);
      const timeMin = new Date(date);
      timeMin.setHours(10, 0, 0, 0);
      const timeMax = new Date(date);
      timeMax.setHours(22, 0, 0, 0);
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin.toISOString())}&timeMax=${encodeURIComponent(timeMax.toISOString())}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const data = await response.json();
      setEvents(data.items || []);
      setError(null);
      // コアタイムの30分刻みスロットを作成
      const slots = getTimeSlots(timeMin, timeMax, 30);
      // バッファ込みで空き枠を判定
      const available = slots.filter(slot => isSlotAvailable(slot, data.items || []));
      setFreeSlots(available);
    } catch (e) {
      setError('予定の取得に失敗しました');
    }
  };

  // Webアプリ用Google認証
  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    onSuccess: tokenResponse => {
      setAccessToken(tokenResponse.access_token);
      fetchCalendarEvents(tokenResponse.access_token, selectedDate);
    },
    onError: () => {
      setError('Google認証失敗');
    }
  });

  // 日付変更時に再取得
  useEffect(() => {
    if (accessToken) {
      fetchCalendarEvents(accessToken, selectedDate);
    }
    // eslint-disable-next-line
  }, [selectedDate]);

  // 希望日時入力欄（動的追加・削除）
  const handlePreferredChange = (idx, field, value) => {
    setPreferredInputs(inputs => inputs.map((input, i) => i === idx ? { ...input, [field]: value } : input));
  };
  const handleAddPreferred = () => {
    setPreferredInputs(inputs => {
      let defaultDate = dayjs();
      if (inputs.length > 0) {
        // 直前の入力の月を反映
        const prevDate = dayjs(inputs[inputs.length - 1].date);
        defaultDate = prevDate.startOf('month');
      }
      return [
        ...inputs,
        {
          date: defaultDate.format('YYYY-MM-DD'),
          start: '10:00',
          end: '22:00',
        },
      ];
    });
  };
  const handleRemovePreferred = (idx) => {
    setPreferredInputs(inputs => inputs.filter((_, i) => i !== idx));
  };

  // 期間全体の空き枠計算（Google認証後、または期間変更時に呼ぶ）
  const fetchAllFreeSlots = async (accessToken, range) => {
    if (!accessToken) return;
    const start = range[0].startDate;
    const end = range[0].endDate;
    // 1. カレンダー一覧を取得
    const calendarListRes = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const calendarListData = await calendarListRes.json();
    const calendarIds = (calendarListData.items || []).map(cal => cal.id);
    // 2. 各カレンダーの予定を取得
    let allEvents = [];
    for (const calendarId of calendarIds) {
      const eventsRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(new Date(start).toISOString())}&timeMax=${encodeURIComponent(new Date(end).toISOString())}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const eventsData = await eventsRes.json();
      if (Array.isArray(eventsData.items)) {
        allEvents = allEvents.concat(eventsData.items);
      }
    }
    // 3. 全スロット生成
    const slots = getAllTimeSlots(start, end, 30);
    // 4. バッファ込みで空き枠判定
    const available = slots.filter(slot => isSlotAvailable(slot, allEvents));
    // 5. 連続する空き枠をまとめる
    setAllFreeSlots(mergeContinuousSlots(available));
  };

  // Google認証後や期間変更時に空き枠再計算
  useEffect(() => {
    if (accessToken) {
      fetchAllFreeSlots(accessToken, dateRange);
    }
    // eslint-disable-next-line
  }, [accessToken, dateRange]);

  // allFreeSlotsの表示前にフィルタ
  const filteredFreeSlots =
    preferredInputs.length === 0 || preferredInputs.every(input => !input.start || !input.end)
      ? allFreeSlots
      : preferredInputs
          .filter(input => input.start && input.end)
          .flatMap(input => {
            return allFreeSlots
              .filter(slot => {
                // 日付が一致
                const slotDate = dayjs(slot.start).format('YYYY-MM-DD');
                if (slotDate !== input.date) return false;
                // 時間帯が重なっているか
                const inputStart = dayjs(`${input.date}T${input.start}`);
                const inputEnd = dayjs(`${input.date}T${input.end}`);
                return dayjs(slot.end).isAfter(inputStart) && dayjs(slot.start).isBefore(inputEnd);
              })
              .map(slot => {
                // 重なり部分だけを切り出す
                const inputStart = dayjs(`${input.date}T${input.start}`);
                const inputEnd = dayjs(`${input.date}T${input.end}`);
                const overlapStart = dayjs(slot.start).isAfter(inputStart) ? slot.start : inputStart.toDate();
                const overlapEnd = dayjs(slot.end).isBefore(inputEnd) ? slot.end : inputEnd.toDate();
                return dayjs(overlapStart).isBefore(overlapEnd) ? { start: overlapStart, end: overlapEnd } : null;
              })
              .filter(Boolean);
          })
          .flat();

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 3 }}>
        <Typography variant="h4" align="center" gutterBottom>
          カレンダー空き時間検索
        </Typography>
        <Box sx={{ my: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="h6" gutterBottom>
            希望期間を選択
          </Typography>
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ja">
            <DateRangePicker
              calendars={2}
              value={[
                dateRange[0].startDate ? dayjs(dateRange[0].startDate) : null,
                dateRange[0].endDate ? dayjs(dateRange[0].endDate) : null
              ]}
              onChange={([start, end]) =>
                setDateRange([
                  {
                    startDate: start ? start.toDate() : null,
                    endDate: end ? end.toDate() : null,
                    key: 'selection',
                  },
                ])
              }
              localeText={{ start: '開始日', end: '終了日' }}
              renderInput={(startProps, endProps) => (
                <React.Fragment>
                  <TextField size="small" {...startProps} sx={{ mx: 1 }} />
                  <span> 〜 </span>
                  <TextField size="small" {...endProps} sx={{ mx: 1 }} />
                </React.Fragment>
              )}
            />
          </LocalizationProvider>
        </Box>
        {/* 希望日時の動的入力欄（選択式） */}
        <Box sx={{ my: 4 }}>
          <Typography variant="h6" gutterBottom>
            特に希望する日・時間帯（必要な分だけ追加できます）
          </Typography>
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ja">
            {preferredInputs.map((input, idx) => (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} key={idx}>
                <DatePicker
                  label="日付"
                  value={input.date ? dayjs(input.date) : null}
                  onChange={date => handlePreferredChange(idx, 'date', date ? dayjs(date).format('YYYY-MM-DD') : '')}
                  views={['year', 'month', 'day']}
                  openTo="day"
                  renderInput={(params) => <TextField {...params} size="small" />}
                  // 前の入力の月を初期表示
                  defaultCalendarMonth={input.date ? dayjs(input.date).toDate() : undefined}
                />
                <FormControl size="small">
                  <InputLabel>開始</InputLabel>
                  <Select
                    value={input.start}
                    label="開始"
                    onChange={e => handlePreferredChange(idx, 'start', e.target.value)}
                  >
                    {timeOptions.slice(0, -1).map((t, i) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <span>〜</span>
                <FormControl size="small">
                  <InputLabel>終了</InputLabel>
                  <Select
                    value={input.end}
                    label="終了"
                    onChange={e => handlePreferredChange(idx, 'end', e.target.value)}
                  >
                    {timeOptions.slice(1).map((t, i) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <IconButton onClick={() => handleRemovePreferred(idx)} color="error">
                  <DeleteIcon />
                </IconButton>
              </Stack>
            ))}
          </LocalizationProvider>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddPreferred} sx={{ mt: 1 }}>
            ＋追加
          </Button>
        </Box>
        <Button onClick={() => login()} style={{fontSize: 18, padding: '8px 24px', margin: '16px 0'}}>Googleでログインして予定取得</Button>
        {error && <div style={{color: 'red'}}>{error}</div>}
        {/* 空き時間の長さ選択 */}
        {/* <div style={{margin: '16px 0'}}>
          <label>空き枠の長さ: </label>
          <select value={slotLength} onChange={e => setSlotLength(Number(e.target.value))} style={{fontSize: 16}}>
            {SLOT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div> */}
        {/* 空き時間の表示（単日分）を削除 */}
        {/* <div style={{textAlign: 'left', marginTop: 20}}>
          <h3>{selectedDate} の空き時間（{slotLength}分枠）</h3>
          <ul>
            {mergeSlots(freeSlots, slotLength).map((slot, i) => (
              <li key={i}>
                {slot.start.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                ~
                {slot.end.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
              </li>
            ))}
          </ul>
        </div> */}
        {/* 期間全体の空き時間表示 */}
        <Box sx={{ my: 4 }}>
          <Typography variant="h6" gutterBottom>
            指定期間の全空き時間（連続枠はまとめて表示）
          </Typography>
          <Card variant="outlined" sx={{ p: 2, background: '#f8fafc' }}>
            <List>
              {preferredInputs.length > 0 && filteredFreeSlots.length === 0 && (
                <ListItem>空き時間がありません</ListItem>
              )}
              {(() => {
                const groupedSlots = groupSlotsByDate(filteredFreeSlots);
                return Object.entries(groupedSlots).map(([date, slots], i) => {
                  const youbi = dayjs(slots[0].start).locale('ja').format('ddd');
                  let youbiColor = undefined;
                  if (youbi === '土') youbiColor = 'blue';
                  if (youbi === '日') youbiColor = 'red';
                  return (
                    <React.Fragment key={date}>
                      <ListItem sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                        <Typography variant="subtitle1" color="primary" fontWeight="bold">
                          {date}
                          <span style={{ color: youbiColor, fontWeight: 'bold' }}>
                            （{youbi}）
                          </span>
                        </Typography>
                        {slots.map((slot, j) => (
                          <span key={j} style={{ marginLeft: 16 }}>
                            {dayjs(slot.start).format('HH:mm')}〜{dayjs(slot.end).format('HH:mm')}
                          </span>
                        ))}
                      </ListItem>
                      {i < Object.entries(groupedSlots).length - 1 && <Divider />}
                    </React.Fragment>
                  );
                });
              })()}
            </List>
          </Card>
        </Box>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </Paper>
    </Container>
  );
}

export default App;
