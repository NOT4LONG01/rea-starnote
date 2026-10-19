# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# ML Kit (handwriting search) brings WorkManager, which opens its Room database by the generated class's name at startup.
# Without this, shrinking drops WorkDatabase_Impl and the release app crashes before its window opens (qa-21 phone).
-keep class * extends androidx.room.RoomDatabase { <init>(); }

# ML Kit finds its parts by class name at run time (component registrars listed in the manifest, model handlers per model
# class). Shrunk, RemoteModelManager found no handler for the ink model: NullPointerException in download() (qa-22 phone).
-keep class com.google.mlkit.** { *; }
-keep class com.google.firebase.components.** { *; }
-keep class * implements com.google.firebase.components.ComponentRegistrar { *; }
# Then ML Kit's internal copy of protobuf (it finds fields by name) failed in a static initializer once renamed. Shrinking
# still removes unused code; names stay, so everything Google finds by reflection keeps working.
-dontobfuscate
-keep class com.google.android.gms.internal.mlkit_** { *; }
