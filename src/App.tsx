import React from "react";
import axios from "axios";
import {
  BrowserRouter,
  Route,
  Routes,
  useSearchParams,
} from "react-router-dom";

import "./App.css";

type Track = {
  name: string;
  artist: string;
};

const LAST_FM_API_KEY = import.meta.env.VITE_LAST_FM_API_KEY;
const SPOTIFY_AUTH_TOKEN = import.meta.env.VITE_SPOTIFY_AUTH_TOKEN;

const lastFmApi = axios.create({
  baseURL: "http://ws.audioscrobbler.com/2.0/",
  params: {
    api_key: LAST_FM_API_KEY,
    format: "json",
    user: "timalanjohnson",
  },
});

async function getWeeklyTrackChart(from: string, to: string): Promise<any> {
  try {
    const response = await lastFmApi.get<any>("", {
      params: {
        method: "user.getWeeklyTrackChart",
        from,
        to,
        limit: 200,
      },
    });
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error("Error fetching weekly track chart:", error);
    return null;
  }
}

// Configure Axios instance for Spotify API
const spotifyAPI = axios.create({
  baseURL: "https://api.spotify.com/v1",
  headers: {
    Authorization: `Bearer ${SPOTIFY_AUTH_TOKEN}`,
    "Content-Type": "application/json",
  },
});

async function createPlaylistWithTracks(userId, playlistName, tracks) {
  // Step 1: Create a new playlist
  const playlistResponse = await spotifyAPI.post(`/users/${userId}/playlists`, {
    name: playlistName,
    description: "My new playlist created via API",
    public: false, // Set true if you want the playlist to be public
  });
  const playlistId = playlistResponse.data.id;

  // Step 2: Search for tracks and collect their Spotify IDs
  const trackIds = await Promise.all(
    tracks.map(async (track) => {
      const query = encodeURIComponent(`${track.name} artist:${track.artist}`);
      const searchResponse = await spotifyAPI.get(
        `/search?q=${query}&type=track&limit=1`
      );
      const tracks = searchResponse.data.tracks.items;
      if (tracks.length > 0) {
        return tracks[0].id;
      } else {
        console.log(`Track not found: ${track.name} by ${track.artist}`);
        return null;
      }
    })
  );

  const filteredTrackIds = trackIds.filter((id) => id !== null); // Remove any nulls (tracks not found)

  // Step 3: Add tracks to the playlist
  await spotifyAPI.post(`/playlists/${playlistId}/tracks`, {
    uris: filteredTrackIds.map((id) => `spotify:track:${id}`),
  });

  console.log(`Playlist created! ID: ${playlistId}`);
  return `https://open.spotify.com/playlist/${playlistId}`;
}

async function getTracks(from: string, to: string): Promise<Track[]> {
  const fromSunday = (
    new Date(findNearestSunday(from)).getTime() / 1000
  ).toString();
  const toSunday = (
    new Date(findNearestSunday(to)).getTime() / 1000
  ).toString();

  const result = await getWeeklyTrackChart(fromSunday, toSunday);

  const simpleResult = result.weeklytrackchart.track
    .filter((_, index) => index > 99)
    .map((track) => ({
      name: track.name,
      artist: track.artist["#text"],
    }));
  return simpleResult;
}

async function onCreatePlaylistWithTracks(
  playlistName: string,
  tracks: Track[]
) {
  return createPlaylistWithTracks("timalanjohnson", playlistName, tracks).catch(
    console.error
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/">
          <Route index element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function Home() {
  const [tracks, setTracks] = React.useState<Track[]>([]);
  const [playlistUrl, setPlaylistUrl] = React.useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const playlistName = `Rediscover ${from} - ${to}`;

  const onGetTracks = React.useCallback(async () => {
    setTracks(await getTracks(from, to));
  }, [from, to]);

  const onCreatePlaylist = React.useCallback(async () => {
    setPlaylistUrl(
      (await onCreatePlaylistWithTracks(playlistName, tracks)) ?? ""
    );
  }, [playlistName, tracks]);

  return (
    <>
      <h1>Rediscover</h1>
      <form
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "16px",
          alignItems: "center",
        }}
      >
        <div>
          <label>From</label>
          <input
            aria-label="Date"
            type="date"
            name="from"
            defaultValue={from}
            max={today()}
            onChange={(e) =>
              setSearchParams({
                from: e.target.value,
                to,
              })
            }
          />
        </div>
        <div>
          <label>To</label>
          <input
            aria-label="Date"
            type="date"
            name="to"
            defaultValue={to}
            min={from}
            max={today()}
            onChange={(e) =>
              setSearchParams({
                from,
                to: e.target.value,
              })
            }
          />
        </div>
      </form>
      <br />
      <div style={{ display: "flex", flexDirection: "row", gap: "16px" }}>
        <button onClick={onGetTracks} disabled={!(from && to)}>
          getTracks
        </button>
        <button onClick={onCreatePlaylist} disabled={tracks.length < 1}>
          createPlaylist
        </button>
      </div>
      {playlistUrl ? (
        <a href={playlistUrl} target="_blank">
          Listen now!
        </a>
      ) : null}
      {tracks ? <TrackList tracks={tracks} /> : null}
    </>
  );
}

function TrackList({ tracks }: { tracks: Track[] }) {
  return (
    <ol>
      {tracks.map((track) => (
        <li>
          {track.name} - {track.artist}
        </li>
      ))}
    </ol>
  );
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // JS months are 0-based
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function findNearestSunday(dateStr) {
  // Parse the input date
  const inputDate = new Date(dateStr);

  // Get the day of the week (0 for Sunday, 1 for Monday, ..., 6 for Saturday)
  const dayOfWeek = inputDate.getDay();

  // Calculate the difference to the nearest Sunday
  let diffToNearestSunday;
  if (dayOfWeek === 0) {
    // If the day is already Sunday
    diffToNearestSunday = 0;
  } else {
    // Calculate days to previous and next Sunday
    const daysToPrevSunday = dayOfWeek; // Since dayOfWeek is the same as days since last Sunday
    const daysToNextSunday = 7 - dayOfWeek; // Days remaining to next Sunday

    // Check which is closer, previous Sunday or next Sunday
    // If it's Wednesday (day 3), it's equidistant to both Sundays, so we choose the next Sunday by default
    diffToNearestSunday =
      daysToPrevSunday <= daysToNextSunday
        ? -daysToPrevSunday
        : daysToNextSunday;
  }

  // Adjust the date by the difference
  const nearestSunday = new Date(
    inputDate.setDate(inputDate.getDate() + diffToNearestSunday)
  );

  // Format the date to yyyy-mm-dd
  const year = nearestSunday.getFullYear();
  const month = String(nearestSunday.getMonth() + 1).padStart(2, "0"); // JS months are 0-based
  const day = String(nearestSunday.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}T12:00:00`;
}

export default App;
