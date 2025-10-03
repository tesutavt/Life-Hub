export type SocialSettings = {
  tg_bot_token?: string | null;
  tg_chat_id?: string | null;
  twitch_channel?: string | null;
  youtube_channel_id?: string | null;
  tg_stream_template?: string | null;
  tg_video_template?: string | null;
  twitch_bot_username?: string | null;
  twitch_bot_token?: string | null;
};

export type TwitchCommand = {
  id: number | null;
  command: string;
  response: string;
  enabled: boolean;
  isNew?: boolean;
};

export type TwitchTimer = {
  id: number | null;
  message: string;
  online_interval_sec: number;
  offline_interval_sec: number;
  enabled: boolean;
  last_sent_at?: string | null;
  isNew?: boolean;
};

export type GoogleSettings = { refresh_token: string | null };
