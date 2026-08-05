package com.app.safexchange.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("admin_auth")

class AuthStore(private val context: Context) {
    private val tokenKey = stringPreferencesKey("token")
    private val emailKey = stringPreferencesKey("email")
    private val fcmKey = stringPreferencesKey("fcm_token")

    val tokenFlow: Flow<String?> = context.dataStore.data.map { it[tokenKey] }
    val emailFlow: Flow<String?> = context.dataStore.data.map { it[emailKey] }

    suspend fun getToken(): String? = context.dataStore.data.first()[tokenKey]
    suspend fun getFcmToken(): String? = context.dataStore.data.first()[fcmKey]

    suspend fun saveSession(token: String, email: String) {
        context.dataStore.edit {
            it[tokenKey] = token
            it[emailKey] = email
        }
    }

    suspend fun saveFcmToken(token: String) {
        context.dataStore.edit { it[fcmKey] = token }
    }

    suspend fun clear() {
        context.dataStore.edit {
            it.remove(tokenKey)
            it.remove(emailKey)
        }
    }
}
