@echo off
echo ========================================
echo   DEXrp Android Build Script
echo ========================================
echo.

REM Check if ANDROID_HOME or ANDROID_SDK_ROOT is set
if defined ANDROID_HOME (
    set "SDK_ROOT=%ANDROID_HOME%"
) else if defined ANDROID_SDK_ROOT (
    set "SDK_ROOT=%ANDROID_SDK_ROOT%"
) else (
    echo WARNING: ANDROID_HOME or ANDROID_SDK_ROOT not set.
    echo Please set one of these environment variables to your Android SDK path.
    echo Example: set ANDROID_HOME=C:\Users\YourName\AppData\Local\Android\Sdk
    echo.
)

echo [1/4] Building web app for Android (mobile mode)...
set VITE_IS_MOBILE_APP=true
call npm run build
set VITE_IS_MOBILE_APP=
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Web build failed!
    pause
    exit /b 1
)
echo.

echo [2/4] Syncing to Android...
call npx cap sync android
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Capacitor sync failed!
    pause
    exit /b 1
)
echo.

echo [3/4] Building APK with Gradle...
echo.
cd android

REM Build debug APK
echo Building DEBUG APK...
call gradlew.bat assembleDebug
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Debug APK build failed!
    cd ..
    pause
    exit /b 1
)
echo.

REM Optionally build release APK (requires signing configuration)
echo.
echo Do you want to build a RELEASE APK? (requires signing key)
set /p BUILD_RELEASE="Enter Y for release, or press Enter for debug only: "
if /i "%BUILD_RELEASE%"=="Y" (
    echo.
    echo Building RELEASE APK...
    call gradlew.bat assembleRelease
    if %ERRORLEVEL% NEQ 0 (
        echo WARNING: Release APK build failed. You may need to configure signing.
        echo See: https://developer.android.com/studio/publish/app-signing
    )
)

cd ..
echo.

echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo APK locations:
echo.
echo   DEBUG APK:
echo   android\app\build\outputs\apk\debug\app-debug.apk
echo.
if /i "%BUILD_RELEASE%"=="Y" (
    echo   RELEASE APK:
    echo   android\app\build\outputs\apk\release\app-release.apk
    echo.
)

echo [4/4] Optional: Install APK to connected device
echo.
set /p INSTALL_APK="Install debug APK to connected device? (Y/N): "
if /i "%INSTALL_APK%"=="Y" (
    echo.
    echo Installing APK...
    if defined SDK_ROOT (
        "%SDK_ROOT%\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
    ) else (
        adb install -r android\app\build\outputs\apk\debug\app-debug.apk
    )
    if %ERRORLEVEL% NEQ 0 (
        echo WARNING: APK installation failed. Make sure a device is connected.
        echo Run "adb devices" to check connected devices.
    ) else (
        echo APK installed successfully!
    )
)

echo.
echo ========================================
echo   Additional Commands
echo ========================================
echo.
echo To install APK manually:
echo   adb install -r android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo To view connected devices:
echo   adb devices
echo.
echo To open Android Studio:
echo   npx cap open android
echo.
echo To clean and rebuild:
echo   cd android ^&^& gradlew.bat clean ^&^& gradlew.bat assembleDebug
echo.
pause
