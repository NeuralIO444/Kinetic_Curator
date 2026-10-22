// useRoomFeed.js — #1560 S1: the codec transcript's records for a component, oldest first.
import { useEffect, useState } from 'react';
import { getRoomFeed, subscribeRoomFeed } from '../curator/roomFeed.js';

/** The retained bus window (at most 60 records, arrival order) as React state. */
export function useRoomFeed() {
  const [records, setRecords] = useState(getRoomFeed);
  useEffect(() => subscribeRoomFeed(() => setRecords(getRoomFeed())), []);
  return records;
}
