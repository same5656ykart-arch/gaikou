import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { clamp, parseNumber, r2 } from '../lib/format';
import { Icon } from './Icon';

interface NumFieldProps {
  label?: ReactNode;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  /** ＋−ボタンを出す */
  stepper?: boolean;
  hint?: ReactNode;
  placeholder?: string;
  /** 空欄を許すか（false なら空にしても元の値に戻る） */
  allowEmpty?: boolean;
  compact?: boolean;
  id?: string;
}

/**
 * 数値入力。入力途中（"1." など）を壊さないよう文字列で持ち、
 * 全角数字も受け付ける。確定は blur / Enter。
 */
export function NumField({
  label,
  value,
  onChange,
  unit,
  step = 0.1,
  min = 0,
  max = 1e9,
  stepper = false,
  hint,
  placeholder,
  allowEmpty = true,
  compact = false,
  id,
}: NumFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value === undefined ? '' : String(value));
  }, [value]);

  const commit = (raw: string) => {
    const n = parseNumber(raw);
    if (n === null) {
      if (allowEmpty) onChange(undefined);
      setText(allowEmpty || value === undefined ? '' : String(value));
      return;
    }
    const v = r2(clamp(n, min, max));
    onChange(v);
    setText(String(v));
  };

  const bump = (dir: number) => {
    const base = value ?? (dir > 0 ? min - step : min);
    const v = r2(clamp(Math.round((base + dir * step) / step) * step, min, max));
    onChange(v);
    setText(String(v));
  };

  return (
    <div className={'field' + (compact ? ' field-compact' : '')}>
      {label !== undefined && (
        <label className="field-label" htmlFor={fid}>
          {label}
        </label>
      )}
      <div className="num-row">
        {stepper && (
          <button type="button" className="btn-step" onClick={() => bump(-1)} aria-label="減らす">
            <Icon name="minus" size={18} />
          </button>
        )}
        <div className="num-input">
          <input
            id={fid}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            placeholder={placeholder}
            onFocus={(e) => {
              focused.current = true;
              e.currentTarget.select();
            }}
            onChange={(e) => {
              setText(e.target.value);
              // 入力のたびに反映（図がすぐ動く）。空や途中の文字は確定時に処理する
              const n = parseNumber(e.target.value);
              if (n !== null && n >= min && n <= max) onChange(r2(n));
            }}
            onBlur={(e) => {
              focused.current = false;
              commit(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          {unit && <span className="num-unit">{unit}</span>}
        </div>
        {stepper && (
          <button type="button" className="btn-step" onClick={() => bump(1)} aria-label="増やす">
            <Icon name="plus" size={18} />
          </button>
        )}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface TextFieldProps {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'tel' | 'date' | 'email';
  placeholder?: string;
  hint?: ReactNode;
  multiline?: boolean;
  id?: string;
}

export function TextField({ label, value, onChange, type = 'text', placeholder, hint, multiline, id }: TextFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label className="field-label" htmlFor={fid}>
        {label}
      </label>
      {multiline ? (
        <textarea id={fid} className="input" rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          id={fid}
          className="input"
          type={type}
          inputMode={type === 'tel' ? 'tel' : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface ChoiceProps {
  options: { v: string; label: string; desc?: string }[];
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  multi?: boolean;
  /** 小さく横並びにする（プロパティパネル用） */
  dense?: boolean;
  label?: string;
}

/** 大きなボタンで選ぶ入力。単一選択は同じものをもう一度押すと解除 */
export function Choice({ options, value, onChange, multi = false, dense = false, label }: ChoiceProps) {
  const selected = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v);
  const toggle = (v: string) => {
    if (multi) {
      const cur = Array.isArray(value) ? value : [];
      onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
    } else {
      onChange(value === v ? '' : v);
    }
  };
  return (
    <div className={'choice' + (dense ? ' choice-dense' : '')} role={multi ? 'group' : 'radiogroup'} aria-label={label}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role={multi ? 'checkbox' : 'radio'}
          aria-checked={selected(o.v)}
          className={'choice-btn' + (selected(o.v) ? ' is-on' : '')}
          onClick={() => toggle(o.v)}
        >
          <span className="choice-mark" aria-hidden="true">
            {selected(o.v) && <Icon name="check" size={14} />}
          </span>
          <span className="choice-text">
            <span className="choice-label">{o.label}</span>
            {o.desc && <span className="choice-desc">{o.desc}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
