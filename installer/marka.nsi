; Windows installer for Marka Photobooth. Built by scripts/build-installer.mjs, which passes
; VERSION, STAGE and OUT. Installs per user, so no administrator rights are needed.
Unicode true
!include "MUI2.nsh"

!define APP "Marka Photobooth"
!define EXE "MarkaPhotobooth.exe"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MarkaPhotobooth"

Name "${APP}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APP} ${VERSION}"

!define MUI_ICON "marka.ico"
!define MUI_UNICON "marka.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Buka ${APP} sekarang"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Indonesian"

Function OpenApp
  ExecShell "open" "$DESKTOP\${APP}.lnk"
FunctionEnd

; The app's own files stay locked while it runs. The exe has its own name, so this stops only this app.
!macro StopApp
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Pop $0
  Sleep 500
!macroend

Section
  !insertmacro StopApp

  ; Remove the old version first so files dropped by a newer one do not linger
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"

  SetOutPath "$INSTDIR"
  File "marka.ico"
  SetOutPath "$INSTDIR\runtime"
  File "${STAGE}/runtime/${EXE}"
  SetOutPath "$INSTDIR\app"
  File /r "${STAGE}/app/*"

  ; .env holds this computer's secrets and is never overwritten by a new version
  SetOutPath "$APPDATA\${APP}"
  SetOverwrite off
  File "/oname=.env" "${STAGE}/.env.example"
  SetOverwrite on

  SetOutPath "$INSTDIR"
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\runtime\${EXE}" '"$INSTDIR\app\scripts\start-installed.mjs"' "$INSTDIR\marka.ico"
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortcut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\runtime\${EXE}" '"$INSTDIR\app\scripts\start-installed.mjs"' "$INSTDIR\marka.ico"
  CreateShortcut "$SMPROGRAMS\${APP}\Pengaturan Google Calendar.lnk" "$WINDIR\notepad.exe" '"$APPDATA\${APP}\.env"'

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Marka Photobooth"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\marka.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  !insertmacro StopApp

  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  Delete "$INSTDIR\marka.ico"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"

  MessageBox MB_YESNO|MB_ICONQUESTION "Hapus juga pengaturan Google Calendar di komputer ini?$\r$\nData event dan invoice tetap aman di Firestore." /SD IDNO IDNO keep
  RMDir /r "$APPDATA\${APP}"
  keep:
SectionEnd
