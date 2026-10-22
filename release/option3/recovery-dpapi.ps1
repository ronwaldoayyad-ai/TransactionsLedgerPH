param([Parameter(Mandatory=$true)][ValidateSet('protect','unprotect')][string]$Mode)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$payload=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
$entropy=[Text.Encoding]::UTF8.GetBytes('LoanLedgerProtectedRecoveryV1')
try {
  if($Mode -eq 'protect') {
    $result=[Security.Cryptography.ProtectedData]::Protect($payload,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  } else {
    $result=[Security.Cryptography.ProtectedData]::Unprotect($payload,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  }
  [Console]::Out.Write([Convert]::ToBase64String($result))
} finally {
  [Array]::Clear($payload,0,$payload.Length)
}
