import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import CalendarGapTimeApp from './App';
import reportWebVitals from './reportWebVitals';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import dayjs from 'dayjs';
import 'dayjs/locale/ja';

// dayjsの日本語ロケールを設定
dayjs.locale('ja');

// 環境変数からGoogle OAuthクライアントIDを取得（セキュリティ強化）
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "1001714813438-qqe7u5l88u0or7qd350ep1boq34bvhvi.apps.googleusercontent.com";

const root = ReactDOM.createRoot(document.getElementById('root'));
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif'
    ].join(','),
  },
  unstable_strictMode: false,
});

root.render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider theme={theme}>
      <CalendarGapTimeApp />
      </ThemeProvider>
    </GoogleOAuthProvider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
