import { useEffect, useRef, useState } from "react"
import { Text } from "react-native"
import { ALLOWED_DOMAINS_HINT, EMAIL_CODE_LENGTH, emailValidationError, isEmailCode } from "@illirent/core"
import { useAuth } from "../src/auth/AuthProvider"
import { Button, ErrorText, Field, Screen, styles } from "../src/components/ui"

export default function SignIn() {
  const { supabase, analytics } = useAuth()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const busy = useRef(false)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  async function run(action: () => Promise<void>) {
    if (busy.current) return
    busy.current = true; setLoading(true); setError(null)
    try { await action() } catch { setError("Could not connect. Check your connection and try again.") }
    finally { busy.current = false; setLoading(false) }
  }
  function sendCode() {
    const normalized = email.trim().toLowerCase()
    const validation = emailValidationError(normalized)
    if (validation) { setError(validation); return }
    if (Date.now() < resendAt) return
    void run(async () => {
      const { error } = await supabase.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true } })
      if (error) { setError(error.status === 429 ? "Too many attempts. Wait a little before requesting another code." : "Could not send a code. Check your email address and try again."); return }
      setEmail(normalized); setCode(""); setStep("code"); setResendAt(Date.now() + 60000)
    })
  }
  function verify() {
    if (!isEmailCode(code)) { setError(`Enter the ${EMAIL_CODE_LENGTH}-digit code from your email.`); return }
    void run(async () => {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" })
      if (error || !data.session) setError("Invalid or expired code. Try again or request another code.")
      else void analytics.track("login")
      // Auth state subscription switches the protected routes after successful verification.
    })
  }
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000))
  return <Screen>
    <Text style={styles.brand}>IlliniRent</Text>
    <Text style={styles.title}>{step === "email" ? "Your next chapter starts here" : "Check your email"}</Text>
    <Text style={styles.body}>{step === "email" ? "Find a place to feel at home around UIUC." : `Enter the ${EMAIL_CODE_LENGTH}-digit sign-in code sent to ${email}.`}</Text>
    {step === "email" ? <>
      <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!loading} onSubmitEditing={sendCode} returnKeyType="go" placeholder="you@illinois.edu" />
      <Text style={styles.body}>{ALLOWED_DOMAINS_HINT}</Text>
    </> : <Field label="Sign-in code" value={code} onChangeText={value => setCode(value.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={EMAIL_CODE_LENGTH} editable={!loading} onSubmitEditing={verify} placeholder="00000000" />}
    <ErrorText message={error} />
    <Button label={loading ? "Please wait…" : step === "email" ? "Email me a code" : "Verify code"} disabled={loading} onPress={step === "email" ? sendCode : verify} />
    {step === "code" && <>
      <Button secondary label={remaining > 0 ? `Resend code in ${remaining}s` : "Resend code"} disabled={loading || remaining > 0} onPress={sendCode} />
      <Button secondary label="Use a different email" disabled={loading} onPress={() => { setStep("email"); setCode(""); setError(null) }} />
    </>}
  </Screen>
}
