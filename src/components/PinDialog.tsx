import { useState } from "react";
import { OPERATOR_PIN } from "../config";
import { pinMatches } from "../state/idle";
import { Dialog } from "./Dialog";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirm dialog that asks for the operator PIN. Prevents accidents only; it is NOT security. */
export function PinDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const submit = () => {
    if (pinMatches(pin, OPERATOR_PIN)) onConfirm();
    else {
      setWrong(true);
      setPin("");
    }
  };
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={submit}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="pin-label">
          Operator PIN
          <input
            className="input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setWrong(false);
            }}
            aria-invalid={wrong}
            autoFocus
          />
        </label>
      </form>
      {wrong && <p className="message message--static">Wrong PIN. Nothing was changed.</p>}
      <p className="hint">The PIN only prevents accidents. It is not security.</p>
    </Dialog>
  );
}
