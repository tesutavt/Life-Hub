# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class com.lifehub.app.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.lifehub.app.**$$serializer { *; }
-keepclassmembers class com.lifehub.app.** { *** Companion; }
# OkHttp
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
# Glance: колбэки и приёмники виджетов создаются по имени класса (рефлексия)
-keep class * implements androidx.glance.appwidget.action.ActionCallback { <init>(); }
-keep class com.lifehub.app.widget.** { *; }
-keep class * extends androidx.work.ListenableWorker { <init>(android.content.Context, androidx.work.WorkerParameters); }
