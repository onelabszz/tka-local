; Script Inno Setup untuk TKA Local Host
#define MyAppName "TKA Local Host"
#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#define MyAppPublisher "Ekwan Nugroho"
#define MyAppURL "https://github.com/onelabszz/tka-local"

[Setup]
; JANGAN gunakan C:\Program Files agar tidak kena blokir izin tulis
DefaultDirName=C:\TKA
DefaultGroupName=TKA Local Host
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=TKA-Setup-v{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
; SetupIconFile=app.ico ; Aktifkan ini jika punya file icon .ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Salin semua isi folder dist ke C:\TKA
Source: "dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Buat shortcut di Start Menu
Name: "{group}\TKA Local Host"; Filename: "{app}\start.bat"; WorkingDir: "{app}"
; Buat shortcut di Desktop
Name: "{autodesktop}\TKA Local Host"; Filename: "{app}\start.bat"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; Jalankan aplikasi setelah instalasi selesai
Filename: "{app}\start.bat"; Description: "{cm:LaunchProgram,TKA Local Host}"; Flags: shellexec postinstall skipifsilent
