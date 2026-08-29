'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  gradesForGroup,
  GROUPS,
  isStudentName,
  joinKoreanName,
  splitKoreanName,
  studentKey,
  studentLabel,
  UNCLASSIFIED,
  volunteerScope,
  type Grade,
  type Group,
  type Student,
  type Volunteer,
} from '@/lib/members';
import { CATEGORIES, parseMessage, resolveGroups, type Category, type NameStatus } from '@/lib/parse';

const STORAGE_ME = 'wss.volunteer';
const STORAGE_PASSWORD = 'wss.password';

interface WeekOption {
  key: string;
  /** '이번 주' / '지난주' */
  name: string;
  /** 버튼 안에 같이 보여 주는 짧은 날짜. 예: 8/2~8/8 */
  range: string;
  /** 고른 주차를 크게 알려 줄 때 쓰는 긴 날짜 */
  label: string;
}

interface AppConfig {
  passwordRequired: boolean;
  sheetUrl: string | null;
  weeks: WeekOption[];
}

interface Roster {
  volunteers: Volunteer[];
  students: Student[];
}

interface DraftName {
  key: string;
  input: string;
  /** 누구인지 확정됐을 때만 채워진다. 이게 null이면 저장할 수 없다. */
  student: Student | null;
  status: NameStatus;
  /** ambiguous: 같은 이름의 후보들 */
  candidates?: Student[];
  /** new: 새 학생을 만들며 채워 나가는 값들. 넷이 다 차야 student가 만들어진다. */
  newSurname?: string;
  newGiven?: string;
  newGroup?: Group;
  newGrade?: Grade;
}

/** 새 학생 칸이 다 찼으면 학생을 만든다. 하나라도 비면 null이라 저장이 막힌다. */
function composeNewStudent(name: DraftName): Student | null {
  const given = (name.newGiven ?? '').trim();
  if (!given || !name.newGroup || !name.newGrade) return null;
  const full = joinKoreanName({ surname: name.newSurname ?? '', given });
  // 자모('ㅡ')나 기호가 섞인 이름은 명단에 넣지 않는다. 나중에 동명이인처럼 걸려 매칭을 망친다.
  if (!isStudentName(full)) return null;
  return { name: full, group: name.newGroup, grade: name.newGrade };
}

/** 새 학생 칸에 한글 아닌 글자가 섞였는지. 빈 칸은 아직 입력 중이니 통과시킨다. */
function badNameChars(value: string | undefined): boolean {
  return !!value && /[^가-힣]/u.test(value.normalize('NFC').trim());
}

interface DraftGroup {
  category: Category;
  names: DraftName[];
}

interface Draft {
  groups: DraftGroup[];
  ignored: string[];
}

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  tone?: 'error';
}

interface RecordItem {
  id: string;
  weekKey: string;
  category: Category;
  student: Student;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `${Date.now()}-${seq}`;
}

/** 후보를 구분하는 데 꼭 필요한 만큼만 보여 준다. 다 같은 그룹이면 그룹 이름은 군더더기다. */
function describeCandidate(candidate: Student, candidates: Student[]): string {
  const sameGroup = candidates.every((other) => other.group === candidate.group);
  return sameGroup ? candidate.grade : `${candidate.grade} · ${candidate.group}`;
}

export default function Page() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [me, setMe] = useState<Volunteer | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPassword(localStorage.getItem(STORAGE_PASSWORD) ?? '');
    const stored = localStorage.getItem(STORAGE_ME);
    if (stored) {
      try {
        setMe(JSON.parse(stored) as Volunteer);
      } catch {
        localStorage.removeItem(STORAGE_ME);
      }
    }
    fetch('/api/config')
      .then((res) => res.json())
      .then((data: AppConfig) => setConfig(data))
      .catch(() => setConfigError('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'))
      .finally(() => setReady(true));
  }, []);

  const handlePassword = useCallback((value: string) => {
    setPassword(value);
    localStorage.setItem(STORAGE_PASSWORD, value);
  }, []);

  const handleMe = useCallback((volunteer: Volunteer | null) => {
    setMe(volunteer);
    if (volunteer) localStorage.setItem(STORAGE_ME, JSON.stringify(volunteer));
    else localStorage.removeItem(STORAGE_ME);
  }, []);

  if (!ready) {
    return (
      <main className="shell">
        <div className="gate">
          <p>불러오는 중…</p>
        </div>
      </main>
    );
  }

  if (configError || !config) {
    return (
      <main className="shell">
        <div className="gate">
          <h2>연결 오류</h2>
          <p>{configError ?? '설정을 불러오지 못했습니다.'}</p>
        </div>
      </main>
    );
  }

  if (config.passwordRequired && !password) {
    return <PasswordGate onSubmit={handlePassword} />;
  }

  if (!me) {
    return <VolunteerGate password={password} onPick={handleMe} onPasswordReject={() => handlePassword('')} />;
  }

  return <Chat config={config} me={me} password={password} onChangeName={() => handleMe(null)} />;
}

// ---------------------------------------------------------------------------

function PasswordGate({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <main className="shell">
      <div className="topbar">
        <h1>주중 목양 현황</h1>
      </div>
      <form
        className="gate"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <h2>비밀번호를 입력해 주세요</h2>
        <p>공동체에 공유된 비밀번호를 입력하면 됩니다. 한 번 입력하면 이 기기에 저장됩니다.</p>
        <input
          type="password"
          value={value}
          autoFocus
          placeholder="공용 비밀번호"
          onChange={(event) => setValue(event.target.value)}
        />
        <button className="primary" type="submit" disabled={!value.trim()}>
          들어가기
        </button>
      </form>
    </main>
  );
}

// ---------------------------------------------------------------------------

function useRoster(password: string, onPasswordReject?: () => void) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(
    () => ({ 'content-type': 'application/json', ...(password ? { 'x-app-password': password } : {}) }),
    [password],
  );

  const reload = useCallback(() => {
    fetch('/api/roster', { headers })
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 401) {
          onPasswordReject?.();
          return;
        }
        if (!res.ok) throw new Error(data.error ?? '명단을 불러오지 못했습니다.');
        setRoster({ volunteers: data.volunteers ?? [], students: data.students ?? [] });
        setError(null);
      })
      .catch((err: Error) => {
        // 명단을 못 읽어도 이름을 직접 입력해 진행할 수는 있게 둔다.
        setError(err.message);
        setRoster({ volunteers: [], students: [] });
      });
  }, [headers, onPasswordReject]);

  useEffect(reload, [reload]);

  return { roster, error, headers, reload };
}

/**
 * 두 단계로 받는다.
 *   1) 봉사자 명단에서 본인 고르기
 *   2) 담당 그룹 고르기 — 이름 매칭 후보를 좁히는 힌트일 뿐이라 건너뛸 수 있다.
 * 시트의 봉사자명단에 담당 그룹이 이미 적혀 있으면 2단계는 건너뛴다.
 */
function VolunteerGate({
  password,
  onPick,
  onPasswordReject,
}: {
  password: string;
  onPick: (volunteer: Volunteer) => void;
  onPasswordReject: () => void;
}) {
  const { roster, error } = useRoster(password, onPasswordReject);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Volunteer | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);

  const term = query.trim();
  const volunteers = roster?.volunteers ?? [];
  const filtered = useMemo(
    () => volunteers.filter((volunteer) => volunteer.name.includes(term)),
    [volunteers, term],
  );

  const choose = (volunteer: Volunteer) => {
    // 시트에 담당이 이미 적혀 있으면 더 물어볼 게 없다.
    if (volunteer.groups.length > 0) onPick(volunteer);
    else setChosen(volunteer);
  };

  if (chosen) {
    return (
      <main className="shell">
        <div className="topbar">
          <h1>주중 목양 현황</h1>
        </div>
        <div className="gate">
          <h2>{chosen.name} 님, 어느 그룹을 맡고 계신가요?</h2>
          <p>
            이름을 찾을 때 담당 그룹부터 봅니다. 예를 들어 <code>은서</code> 라고만 적어도 담당 그룹의 학생을
            먼저 찾아 줍니다. 안 골라도 되고, 그러면 학생 전체에서 찾습니다.
          </p>

          <div className="roster">
            {GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={groups.includes(group)}
                className={groups.includes(group) ? 'picked' : undefined}
                onClick={() =>
                  setGroups((prev) =>
                    prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group],
                  )
                }
              >
                {group}
              </button>
            ))}
          </div>

          <button className="primary" type="button" onClick={() => onPick({ ...chosen, groups })}>
            {groups.length > 0 ? `${groups.join(', ')} 담당으로 시작` : '고르지 않고 시작'}
          </button>
          <button className="secondary" type="button" onClick={() => setChosen(null)}>
            이름 다시 고르기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="topbar">
        <h1>주중 목양 현황</h1>
      </div>
      <div className="gate">
        <h2>봉사자 본인 이름을 골라 주세요</h2>
        <p>
          여기서 고른 이름으로 &ldquo;누가 목양했는지&rdquo;가 기록됩니다. 이 기기에 저장되어 다음부터는 바로
          입력할 수 있어요.
        </p>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        <input
          type="text"
          value={query}
          placeholder="이름 검색 또는 직접 입력"
          onChange={(event) => setQuery(event.target.value)}
        />

        {roster === null && !error && <p>명단을 불러오는 중…</p>}

        <div className="roster">
          {filtered.map((volunteer) => (
            <button key={volunteer.name} type="button" onClick={() => choose(volunteer)}>
              {volunteer.name}
              {volunteer.groups.length > 0 && <span className="badge">{volunteerScope(volunteer)}</span>}
            </button>
          ))}
        </div>

        {roster !== null && term && !filtered.some((volunteer) => volunteer.name === term) && (
          <button className="primary" type="button" onClick={() => setChosen({ name: term, groups: [] })}>
            &lsquo;{term}&rsquo; 이름으로 시작하기 (봉사자 명단에 새로 추가)
          </button>
        )}

        {roster !== null && volunteers.length === 0 && !error && (
          <p>아직 봉사자 명단이 비어 있습니다. `npm run seed` 로 명단을 먼저 넣어 주세요.</p>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function Chat({
  config,
  me,
  password,
  onChangeName,
}: {
  config: AppConfig;
  me: Volunteer;
  password: string;
  onChangeName: () => void;
}) {
  const { roster, headers, reload } = useRoster(password);
  const [weekKey, setWeekKey] = useState(config.weeks[0]?.key ?? '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const students = roster?.students ?? [];

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, draft]);

  const say = useCallback((text: string, tone?: 'error') => {
    setMessages((prev) => [...prev, { id: nextId(), role: 'bot', text, tone }]);
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }]);
    setInput('');

    const parsed = parseMessage(text);
    if (parsed.groups.length === 0) {
      say(
        '항목을 찾지 못했어요. 문자 / 통화 / 성경 / 만남 중 하나로 시작해 주세요.\n예) 성경 - 철수, 영희',
        'error',
      );
      return;
    }

    // 담당 그룹 학생부터 찾게 해서 이름 충돌을 줄인다.
    const resolved = resolveGroups(parsed.groups, students, me.groups);
    setDraft({
      ignored: parsed.ignored,
      groups: resolved.map((group) => ({
        category: group.category,
        names: group.names.map((name) => {
          // 새 이름은 성·이름·그룹·학년을 직접 고르게 한다.
          // 성/이름 분리는 추정이고, 담당 그룹이 하나뿐일 때만 그룹을 미리 채운다.
          const parts = name.status === 'new' ? splitKoreanName(name.name) : null;
          return {
            key: nextId(),
            input: name.input,
            status: name.status,
            candidates: name.candidates,
            newSurname: parts?.surname,
            newGiven: parts?.given,
            newGroup: name.status === 'new' && me.groups.length === 1 ? me.groups[0] : undefined,
            newGrade: undefined,
            student:
              name.status === 'matched' && name.group && name.grade
                ? { name: name.name, group: name.group, grade: name.grade }
                : null,
          };
        }),
      })),
    });
  }, [input, students, me.groups, say]);

  const updateName = useCallback((category: Category, key: string, patch: Partial<DraftName>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            groups: prev.groups.map((group) =>
              group.category === category
                ? {
                    ...group,
                    names: group.names.map((n) => {
                      if (n.key !== key) return n;
                      const next = { ...n, ...patch };
                      // 새 학생은 네 칸이 다 차야 확정된다. 칸을 고칠 때마다 다시 계산한다.
                      return next.status === 'new' ? { ...next, student: composeNewStudent(next) } : next;
                    }),
                  }
                : group,
            ),
          }
        : prev,
    );
  }, []);

  /** 학생 한 명을 다른 항목으로 옮긴다. 비게 된 항목은 사라진다. */
  const moveName = useCallback((from: Category, key: string, to: Category) => {
    if (from === to) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const moving = prev.groups
        .find((group) => group.category === from)
        ?.names.find((n) => n.key === key);
      if (!moving) return prev;
      const rest = prev.groups
        .map((group) =>
          group.category === from ? { ...group, names: group.names.filter((n) => n.key !== key) } : group,
        )
        .filter((group) => group.names.length > 0);
      const groups = rest.some((group) => group.category === to)
        ? rest.map((group) =>
            group.category === to ? { ...group, names: [...group.names, moving] } : group,
          )
        : [...rest, { category: to, names: [moving] }];
      // 항목 순서는 늘 문자·통화·성경·만남으로 고정한다.
      groups.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
      return { ...prev, groups };
    });
  }, []);

  const removeName = useCallback((category: Category, key: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const groups = prev.groups
        .map((group) =>
          group.category === category
            ? { ...group, names: group.names.filter((n) => n.key !== key) }
            : group,
        )
        .filter((group) => group.names.length > 0);
      return groups.length > 0 ? { ...prev, groups } : null;
    });
  }, []);

  const unresolved = draft?.groups.some((group) => group.names.some((name) => !name.student)) ?? false;

  const handleSave = useCallback(async () => {
    if (!draft) return;
    const entries = draft.groups.flatMap((group) =>
      group.names
        .filter((name) => name.student)
        .map((name) => ({ category: group.category, student: name.student! })),
    );
    if (entries.length === 0) return;

    setSaving(true);
    try {
      const response = await fetch('/api/records', {
        method: 'POST',
        headers,
        body: JSON.stringify({ volunteer: me.name, weekKey, entries }),
      });
      const data = await response.json();
      if (!response.ok) {
        say(data.error ?? '저장에 실패했습니다.', 'error');
        return;
      }

      const weekName = config.weeks.find((week) => week.key === weekKey)?.name ?? weekKey;
      const lines = [`${weekName} 기록 ${data.added.length}건을 저장했어요.`];
      if (data.duplicates?.length > 0) {
        const dup = data.duplicates.map((d: { category: string; student: string }) => `${d.category} ${d.student}`);
        lines.push(`이미 등록되어 있어 건너뛴 건: ${dup.join(', ')}`);
      }
      say(lines.join('\n'));
      setDraft(null);
      reload();
    } catch {
      say('네트워크 오류로 저장하지 못했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }, [draft, headers, me.name, weekKey, config.weeks, say, reload]);

  const activeWeek = config.weeks.find((week) => week.key === weekKey);

  return (
    <main className="shell">
      <div className="topbar">
        <h1>주중 목양 현황</h1>
        <div className="spacer" />
        <button className="chip-button" type="button" onClick={onChangeName}>
          {me.name} ▾
        </button>
        <button className="chip-button" type="button" onClick={() => setPanelOpen(true)}>
          내 기록
        </button>
        <a
          className="link-button"
          href="https://github.com/Isaac-Lee/weekday-shepherd-stats/blob/main/docs/GUIDE.md"
          target="_blank"
          rel="noreferrer"
        >
          사용법
        </a>
        {config.sheetUrl && (
          <a className="link-button" href={config.sheetUrl} target="_blank" rel="noreferrer">
            시트 열기
          </a>
        )}
      </div>

      <div className="weekbar">
        <div className="week-options">
          {config.weeks.map((week) => (
            <button
              key={week.key}
              type="button"
              className="week-option"
              // 이름과 날짜가 두 조각이라 그냥 두면 '이번 주8/9~8/15'로 붙어 읽힌다.
              aria-label={`${week.name} ${week.range}`}
              aria-pressed={week.key === weekKey}
              onClick={() => setWeekKey(week.key)}
            >
              {/* 두 주차의 날짜를 같이 띄워 둔다. 눌러 보지 않아도 어느 쪽인지 구분된다. */}
              <span className="week-name">{week.name}</span>
              <span className="week-range">{week.range}</span>
            </button>
          ))}
        </div>
        <p className="week-active" aria-live="polite">
          <span>
            지금 <strong>{activeWeek?.name}</strong>에 기록 중
          </span>
          <span className="week-active-dates">{activeWeek?.label}</span>
        </p>
      </div>

      <div className="thread" ref={threadRef}>
        {messages.length === 0 && (
          <div className="hint">
            평소 단톡방에 올리듯 그대로 적어서 보내 주세요.
            <br />
            <code>성경 - 철수, 영희</code> <code>문자- 민수</code>
            <br />
            여러 줄로 한 번에 보내도 됩니다.
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user' ? 'bubble user' : `bubble bot${message.tone === 'error' ? ' error' : ''}`
            }
          >
            {message.text}
          </div>
        ))}

        {draft && (
          <div className="draft">
            <h2>
              <span className="draft-week">{activeWeek?.name ?? weekKey}</span>
              <span className="draft-meta">
                {activeWeek?.range} · 봉사자 {me.name}
              </span>
            </h2>
            <div className="names">
              {draft.groups.flatMap((group) =>
                  group.names.map((name) => (
                    <span
                      key={name.key}
                      className={
                        name.status === 'new'
                          ? 'name-chip new-student'
                          : `name-chip ${name.student ? name.status : 'ambiguous'}`
                      }
                    >
                      {/* 항목을 잘못 적었을 때 학생마다 여기서 바로 바꾼다. */}
                      <CategorySelect
                        value={group.category}
                        label={name.input}
                        onChange={(next) => moveName(group.category, name.key, next)}
                      />
                      {name.status === 'new' ? (
                        // 명단에 없는 이름. 성·이름·그룹·학년을 여기서 정해 명단에 제대로 들어가게 한다.
                        <>
                          <span className="new-student-head">
                            <span className="badge">새 학생</span>
                            <span className="new-student-preview">
                              &lsquo;{name.input}&rsquo; → {joinKoreanName({
                                surname: name.newSurname ?? '',
                                given: name.newGiven ?? '',
                              }) || '?'}
                            </span>
                            {(badNameChars(name.newSurname) || badNameChars(name.newGiven)) && (
                              <span className="new-student-hint">한글 이름만 넣을 수 있어요</span>
                            )}
                          </span>
                          <input
                            className="surname-input"
                            type="text"
                            aria-label={`${name.input} 성`}
                            placeholder="성"
                            data-invalid={badNameChars(name.newSurname) || undefined}
                            value={name.newSurname ?? ''}
                            onChange={(event) =>
                              updateName(group.category, name.key, { newSurname: event.target.value })
                            }
                          />
                          <input
                            className="given-input"
                            type="text"
                            aria-label={`${name.input} 이름`}
                            placeholder="이름"
                            data-invalid={badNameChars(name.newGiven) || undefined}
                            value={name.newGiven ?? ''}
                            onChange={(event) =>
                              updateName(group.category, name.key, { newGiven: event.target.value })
                            }
                          />
                          <select
                            className="group-select"
                            aria-label={`${name.input} 그룹`}
                            value={name.newGroup ?? ''}
                            onChange={(event) => {
                              const picked = event.target.value as Group | '';
                              // 그룹을 바꾸면 학년 선택지가 통째로 달라지므로 학년은 다시 고르게 한다.
                              updateName(group.category, name.key, {
                                newGroup: picked || undefined,
                                newGrade: undefined,
                              });
                            }}
                          >
                            <option value="">그룹 선택</option>
                            {GROUPS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label={`${name.input} 학년`}
                            value={name.newGrade ?? ''}
                            disabled={!name.newGroup}
                            onChange={(event) => {
                              const grade = event.target.value as Grade | '';
                              updateName(group.category, name.key, { newGrade: grade || undefined });
                            }}
                          >
                            <option value="">학년 선택</option>
                            {name.newGroup &&
                              gradesForGroup(name.newGroup).map((grade) => (
                                <option key={grade} value={grade}>
                                  {grade === UNCLASSIFIED ? '학년 모름' : grade}
                                </option>
                              ))}
                          </select>
                        </>
                      ) : name.student ? (
                        <>
                          <span className="badge">{name.student.grade}</span>
                          {name.student.name}
                        </>
                      ) : (
                        // 같은 이름 후보가 여럿. 누구인지 여기서 고른다.
                        <PickMenu
                          value=""
                          options={(name.candidates ?? []).map((candidate) => ({
                            value: studentKey(candidate),
                            label: candidate.name,
                            hint: describeCandidate(candidate, name.candidates!),
                          }))}
                          trigger={`${name.input} · 선택`}
                          triggerClass="candidate-label"
                          ariaLabel={`${name.input} 후보 고르기`}
                          menuLabel="같은 이름 후보"
                          onChange={(value) => {
                            const picked = name.candidates?.find(
                              (candidate) => studentKey(candidate) === value,
                            );
                            if (picked) updateName(group.category, name.key, { student: picked, status: 'matched' });
                          }}
                        />
                      )}
                      <button
                        type="button"
                        className="remove"
                        aria-label={`${name.input} 빼기`}
                        onClick={() => removeName(group.category, name.key)}
                      >
                        ×
                      </button>
                    </span>
                  )),
              )}
            </div>

            {draft.ignored.length > 0 && (
              <p className="badge">해석하지 못한 내용: {draft.ignored.join(' / ')}</p>
            )}
            {unresolved && (
              <p className="warning">
                아직 정해지지 않은 이름이 있어요. 새 학생은 그룹과 학년까지 골라 주세요.
              </p>
            )}

            <div className="draft-actions">
              {/* 저장 버튼에도 주차를 적어 둔다. 마지막으로 확인하는 자리라 여기가 제일 중요하다. */}
              <button className="primary" type="button" onClick={handleSave} disabled={saving || unresolved}>
                {saving ? '저장 중…' : `${activeWeek?.name ?? '이번 주'}로 저장`}
              </button>
              <button className="secondary" type="button" onClick={() => setDraft(null)} disabled={saving}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="composer">
        <textarea
          value={input}
          placeholder="예) 성경 - 철수, 영희"
          rows={1}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // 줄바꿈이 잦은 형식이라 Enter는 줄바꿈, 보내기는 ⌘/Ctrl+Enter로 둔다.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <button className="primary" type="button" onClick={handleSend} disabled={!input.trim()}>
          정리
        </button>
      </div>

      {panelOpen && (
        <RecordsPanel
          headers={headers}
          me={me}
          students={students}
          weeks={config.weeks}
          initialWeek={weekKey}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

interface PickOption {
  value: string;
  label: string;
  /** 이름 뒤에 흐리게 붙는 부연. 동명이인 후보의 학년·그룹처럼. */
  hint?: string;
  /** 항목 색을 입힐 때 쓴다. */
  tone?: string;
}

/**
 * 앱이 직접 그리는 드롭다운.
 * 브라우저가 그리는 select 목록은 화면 디자인과 따로 놀아서, 항목 바꾸기와 동명이인 고르기가
 * 같은 모양을 쓰도록 한 곳에 모아 뒀다.
 */
function PickMenu({
  value,
  options,
  trigger,
  triggerClass,
  tone,
  ariaLabel,
  menuLabel,
  onChange,
}: {
  /** 지금 골라져 있는 값. 없으면 빈 문자열 */
  value: string;
  options: PickOption[];
  /** 버튼에 보이는 글자 */
  trigger: string;
  triggerClass: string;
  tone?: string;
  ariaLabel: string;
  menuLabel: string;
  onChange: (next: string) => void;
}) {
  // 메뉴는 스크롤 영역 안에 있어 아래쪽이 잘린다. 그래서 화면 좌표(fixed)로 띄운다.
  const [spot, setSpot] = useState<{ left: number; top: number; width: number } | null>(null);
  const open = spot !== null;
  const boxRef = useRef<HTMLDivElement>(null);

  const openMenu = useCallback(() => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    // 아래 공간이 모자라면 버튼 위로 펼친다. 한 줄 32px + 위아래 여백 8px로 어림잡는다.
    const height = options.length * 32 + 8;
    const below = window.innerHeight - rect.bottom;
    setSpot({
      left: rect.left,
      top: below < height + 8 ? rect.top - height - 4 : rect.bottom + 4,
      width: rect.width,
    });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === 'scroll' || !boxRef.current?.contains(event.target as Node)) setSpot(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    // 스크롤·리사이즈하면 좌표가 어긋나므로 그냥 닫는다.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div
      className="pick-select"
      ref={boxRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSpot(null);
      }}
    >
      <button
        type="button"
        className={triggerClass}
        data-category={tone}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setSpot(null) : openMenu())}
      >
        {trigger}
        <span className="chevron" aria-hidden="true" />
      </button>
      {spot && (
        <ul
          className="pick-menu"
          role="listbox"
          aria-label={menuLabel}
          style={{ left: spot.left, top: spot.top, minWidth: spot.width }}
        >
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                data-category={option.tone}
                onClick={() => {
                  setSpot(null);
                  onChange(option.value);
                }}
              >
                {option.label}
                {option.hint && <span className="pick-hint">{option.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 항목(문자/통화/성경/만남) 고르는 드롭다운. */
function CategorySelect({
  value,
  label,
  onChange,
}: {
  value: Category;
  /** 누구의 항목인지 읽어 주기 위한 이름 */
  label: string;
  onChange: (next: Category) => void;
}) {
  return (
    <PickMenu
      value={value}
      options={CATEGORIES.map((option) => ({ value: option, label: option, tone: option }))}
      trigger={value}
      triggerClass="group-label"
      tone={value}
      ariaLabel={`${label} 항목 ${value}, 바꾸기`}
      menuLabel="항목"
      onChange={(next) => onChange(next as Category)}
    />
  );
}

function RecordsPanel({
  headers,
  me,
  students,
  weeks,
  initialWeek,
  onClose,
}: {
  headers: Record<string, string>;
  me: Volunteer;
  students: Student[];
  weeks: WeekOption[];
  initialWeek: string;
  onClose: () => void;
}) {
  const [weekKey, setWeekKey] = useState(initialWeek);
  const [records, setRecords] = useState<RecordItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setRecords(null);
    const query = new URLSearchParams({ volunteer: me.name, week: weekKey });
    fetch(`/api/records?${query}`, { headers })
      .then((res) => res.json())
      .then((data) => setRecords(data.records ?? []))
      .catch(() => setRecords([]));
  }, [headers, me.name, weekKey]);

  useEffect(load, [load]);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      const response = await fetch(`/api/records?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      if (response.ok) setRecords((prev) => (prev ? prev.filter((record) => record.id !== id) : prev));
    } finally {
      setBusy(null);
    }
  };

  const sorted = useMemo(
    () =>
      (records ?? [])
        .slice()
        .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)),
    [records],
  );

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{me.name} 님이 기록한 내용</h2>
          <button className="chip-button" type="button" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="week-options">
          {weeks.map((week) => (
            <button
              key={week.key}
              type="button"
              className="week-option"
              // 이름과 날짜가 두 조각이라 그냥 두면 '이번 주8/9~8/15'로 붙어 읽힌다.
              aria-label={`${week.name} ${week.range}`}
              aria-pressed={week.key === weekKey}
              onClick={() => setWeekKey(week.key)}
            >
              <span className="week-name">{week.name}</span>
              <span className="week-range">{week.range}</span>
            </button>
          ))}
        </div>

        {records === null && <p className="empty">불러오는 중…</p>}
        {records !== null && sorted.length === 0 && <p className="empty">이 주차에 저장된 기록이 없습니다.</p>}

        {sorted.map((record) => (
          <div className="record-row" key={record.id}>
            <span className="cat" style={{ color: `var(--accent-${record.category})` }}>
              {record.category}
            </span>
            <span className="who">{studentLabel(record.student, students)}</span>
            <button type="button" disabled={busy === record.id} onClick={() => remove(record.id)}>
              {busy === record.id ? '…' : '삭제'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
