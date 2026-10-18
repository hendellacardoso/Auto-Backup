; Remove o serviço do Windows ao desinstalar (se estiver instalado)
; Com SetShellVarContext all, $APPDATA aponta para C:\ProgramData
!macro customUnInstall
  SetShellVarContext all
  IfFileExists "$APPDATA\API2Dev\SistemaBackup\service\API2DevBackupService.exe" 0 +3
    nsExec::ExecToLog '"$APPDATA\API2Dev\SistemaBackup\service\API2DevBackupService.exe" stop'
    nsExec::ExecToLog '"$APPDATA\API2Dev\SistemaBackup\service\API2DevBackupService.exe" uninstall'
!macroend
