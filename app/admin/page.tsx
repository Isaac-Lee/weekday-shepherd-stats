'use client';

/**
 * 관리 화면. 기록을 손대지 않고 통계만 본다.
 * 지금은 '그 주에 목양을 한 건도 받지 못한 학생'만 보여 준다.
 */

import { useCallback, useEffect, useState } from 'react';

import { ADMIN_PASSWORD_HEADER } from '@/lib/auth';
import type { Student } from '@/lib/members';

/** 봉사자용 비밀번호와 따로 저장한다. 관리 화면은 아무나 열 수 없어야 한다. */
const STORAGE_ADMIN_PASSWORD = 'wss.admin';

interface WeekOption {
  key: string;
  name: string;
  range: string;
  label: string;
}

interface Stats {
  weekKey: string;
  label: string;
  total: number;
  missed: Student[];
}

export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [weekKey, setWeekKey] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** 비밀번호를 받아야 하는 상태. 처음에는 저장된 값으로 한 번 시도해 본다. */
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setPassword(localStorage.getItem(STORAGE_ADMIN_PASSWORD) ?? '');
    fetch('/api/config')
      .then((response) => response.json())
      .then((data: { weeks: WeekOption[] }) => {
        setWeeks(data.weeks);
        setWeekKey(data.weeks[0]?.key ?? '');
      })
      .catch(() => setError('설정을 불러오지 못했습니다.'));
  }, []);

  const load = useCallback(async () => {
    if (password === null || !weekKey) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/stats?week=${weekKey}`, {
        headers: password ? { [ADMIN_PASSWORD_HEADER]: password } : undefined,
      });
      const data = await response.json();
      if (!response.ok) {
        // 비밀번호가 틀리면 저장된 값을 지우고 다시 묻는다.
        if (response.status === 401) {
          localStorage.removeItem(STORAGE_ADMIN_PASSWORD);
          setPassword('');
          setLocked(true);
        }
        throw new Error(data.error ?? '통계를 불러오지 못했습니다.');
      }
      setStats(data);
    } catch (cause) {
      setStats(null);
      setError(cause instanceof Error ? cause.message : '통계를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [password, weekKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeWeek = weeks.find((week) => week.key === weekKey);

  if (locked) {
    return (
      <main className="shell">
        <div className="topbar">
          <h1>목양 통계</h1>
        </div>
        <form
          className="gate"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get('password');
            if (typeof value !== 'string' || !value.trim()) return;
            localStorage.setItem(STORAGE_ADMIN_PASSWORD, value.trim());
            setPassword(value.trim());
            setLocked(false);
          }}
        >
          <h2>관리자 비밀번호를 입력해 주세요</h2>
          <p>통계 화면은 목양 현황 전체가 보이는 화면이라 따로 잠가 두었습니다.</p>
          <input name="password" type="password" autoFocus placeholder="관리자 비밀번호" />
          <button className="primary" type="submit">
            들어가기
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="topbar">
        <h1>목양 통계</h1>
        <div className="spacer" />
        <a className="link-button" href="/">
          기록하러 가기
        </a>
      </div>

      <div className="weekbar">
        <div className="week-options">
          {weeks.map((week) => (
            <button
              key={week.key}
              type="button"
              className="week-option"
              aria-label={`${week.name} ${week.range}`}
              aria-pressed={week.key === weekKey}
              onClick={() => setWeekKey(week.key)}
            >
              <span className="week-name">{week.name}</span>
              <span className="week-range">{week.range}</span>
            </button>
          ))}
        </div>
        <p className="week-active" aria-live="polite">
          <span>
            <strong>{activeWeek?.name ?? ''}</strong> 통계
          </span>
          <span className="week-active-dates">{activeWeek?.label}</span>
        </p>
      </div>

      <div className="gate">
        <h2>목양 0건 학생</h2>
        {error && <p className="stat-error">{error}</p>}
        {loading && <p>불러오는 중…</p>}
        {!loading && stats && (
          <>
            <p>
              전체 {stats.total}명 중 <strong>{stats.missed.length}명</strong>
            </p>
            {groupBy(stats.missed).map(([group, members]) => (
              <section key={group}>
                <h3 className="stat-group">
                  {group} <span className="badge">{members.length}명</span>
                </h3>
                <div className="names">
                  {members.map((student) => (
                    <span className="name-chip" key={`${student.name}|${student.grade}`}>
                      {student.name}
                      <span className="badge">{student.grade}</span>
                    </span>
                  ))}
                </div>
              </section>
            ))}
            {stats.missed.length === 0 && <p>모든 학생이 한 번 이상 목양받았습니다.</p>}
          </>
        )}
        <button className="secondary" type="button" onClick={() => void load()} disabled={loading}>
          새로고침
        </button>
      </div>
    </main>
  );
}

/** 이미 그룹 순으로 정렬돼 오므로 순서를 유지하며 묶기만 한다. */
function groupBy(students: Student[]): [string, Student[]][] {
  const groups = new Map<string, Student[]>();
  for (const student of students) {
    const bucket = groups.get(student.group) ?? [];
    bucket.push(student);
    groups.set(student.group, bucket);
  }
  return [...groups];
}
