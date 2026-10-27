package com.lifehub.app

import android.app.Application
import com.lifehub.app.data.Session
import com.lifehub.app.notify.Notifications
import com.lifehub.app.notify.ReminderAlarm
import com.lifehub.app.notify.ReminderWorker

class LifeHubApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Session.init(this)
        Notifications.createChannels(this)
        ReminderWorker.schedule(this)
        ReminderAlarm.schedule(this)
    }
}
