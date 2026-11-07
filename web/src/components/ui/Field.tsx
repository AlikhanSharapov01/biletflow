import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldLook {
  label: ReactNode;
  // Small grey hint after the label, e.g. "Optional".
  hint?: string;
  className?: string;
}

function FieldLabel({ label, hint }: Pick<FieldLook, "label" | "hint">) {
  return (
    <span className="field-label">
      {label}
      {hint ? <small> {hint}</small> : null}
    </span>
  );
}

function fieldClass(extra?: string): string {
  return extra ? `field ${extra}` : "field";
}

type TextFieldProps = FieldLook & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

// Labelled input (mobile ui/TextField): 13px label, 46px / 15px input.
export function TextField({ label, hint, className, ...input }: TextFieldProps) {
  return (
    <label className={fieldClass(className)}>
      <FieldLabel label={label} hint={hint} />
      <input {...input} />
    </label>
  );
}

type TextAreaFieldProps = FieldLook & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export function TextAreaField({ label, hint, className, ...textarea }: TextAreaFieldProps) {
  return (
    <label className={fieldClass(className)}>
      <FieldLabel label={label} hint={hint} />
      <textarea {...textarea} />
    </label>
  );
}

type SelectFieldProps = FieldLook & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">;

// Native <select> with the same label and box as TextField.
export function SelectField({ label, hint, className, children, ...select }: SelectFieldProps) {
  return (
    <label className={fieldClass(className)}>
      <FieldLabel label={label} hint={hint} />
      <select {...select}>{children}</select>
    </label>
  );
}

type CheckboxFieldProps = Omit<FieldLook, "hint"> & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type">;

export function CheckboxField({ label, className, ...input }: CheckboxFieldProps) {
  return (
    <label className={fieldClass(`checkbox-field${className ? ` ${className}` : ""}`)}>
      <input type="checkbox" {...input} />
      <span className="field-label">{label}</span>
    </label>
  );
}
