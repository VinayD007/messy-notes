# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep annotations, debug metadata, and generic signatures
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault

-keep @androidx.annotation.Keep class * { *; }
-keepclassmembers class * {
    @androidx.annotation.Keep *;
}
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}

# Application classes and generated R resources
-keep class com.oneline.notes.** { *; }
-keepclassmembers class com.oneline.notes.** { *; }
-keep class com.oneline.notes.R$* { *; }

# Navigation state, AndroidX Lifecycle, SavedState, and Screens
-keep class androidx.lifecycle.** { *; }
-keep class androidx.savedstate.** { *; }
-keep class androidx.fragment.app.** { *; }
-keep class androidx.activity.** { *; }
-keep class androidx.core.content.res.ResourcesCompat { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class org.devio.rn.splashscreen.** { *; }

# Serialization models (Parcelable, Serializable, kotlinx.serialization, org.json)
-keepnames class * implements android.os.Parcelable
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}
-keepnames class * implements java.io.Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}
-keep,includedescriptorclasses class kotlinx.serialization.** { *; }
-keepclassmembers class **$Companion {
    *** serializer(...);
}
-keep class org.json.** { *; }

# React Native, TurboModules, Hermes, SoLoader, and Expo modules
-keep class com.facebook.react.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
    @com.facebook.react.uimanager.annotations.ReactProp <methods>;
    @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>;
    native <methods>;
}
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class expo.modules.** { *; }

# Native libraries and storage modules
-keep class com.swmansion.reanimated.** { *; }
-keep class com.mrousavy.mmkv.** { *; }
-keep class com.tencent.mmkv.** { *; }
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class com.reactnativecommunity.netinfo.** { *; }

-dontwarn com.facebook.react.**
-dontwarn com.swmansion.reanimated.**
-dontwarn expo.modules.**
-dontwarn kotlinx.serialization.**
