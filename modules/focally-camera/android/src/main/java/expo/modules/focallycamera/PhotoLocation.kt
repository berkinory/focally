package expo.modules.focallycamera

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat

class PhotoLocation(private val context: Context) : LocationListener {
    data class Fix(val location: Location, val precise: Boolean) {
        fun permitted(context: Context): Location? = location.takeIf {
            allowed(context, Manifest.permission.ACCESS_FINE_LOCATION) ||
                (!precise && allowed(context, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    private val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    private val locations = mutableMapOf<String, Location>()
    private var listening = false
    private var precise = false

    @SuppressLint("MissingPermission")
    fun setEnabled(enabled: Boolean) {
        val fine = allowed(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = allowed(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (!enabled || (!fine && !coarse) || manager == null) {
            stop()
            return
        }
        if (listening && fine == precise) return
        stop()
        precise = fine
        listening = true
        val providers = mutableListOf(LocationManager.NETWORK_PROVIDER)
        if (fine) providers += LocationManager.GPS_PROVIDER
        for (provider in providers.filter { it in manager.allProviders }) {
            try {
                manager.requestLocationUpdates(provider, 10_000L, 10f, this, Looper.getMainLooper())
                if (manager.isProviderEnabled(provider)) {
                    manager.getLastKnownLocation(provider)?.let {
                        locations[provider] = Location(it)
                    }
                }
            } catch (_: SecurityException) {
                stop()
                return
            } catch (_: IllegalArgumentException) {
                locations.remove(provider)
            }
        }
    }

    fun snapshot(): Fix? {
        if (!listening || manager?.isLocationEnabled != true) return null
        if (!permissionUnchanged()) {
            stop()
            return null
        }
        val now = SystemClock.elapsedRealtimeNanos()
        val location =
            locations.values
                .filter {
                    val age = now - it.elapsedRealtimeNanos
                    age in 0L..60_000_000_000L &&
                        it.elapsedRealtimeNanos > 0 &&
                        it.time > 0 &&
                        it.hasAccuracy() &&
                        it.accuracy.isFinite() &&
                        it.accuracy >= 0 &&
                        it.latitude.isFinite() &&
                        it.latitude in -90.0..90.0 &&
                        it.longitude.isFinite() &&
                        it.longitude in -180.0..180.0
                }
                .maxByOrNull { it.elapsedRealtimeNanos } ?: return null
        return Fix(Location(location), precise)
    }

    override fun onLocationChanged(location: Location) {
        if (!listening) return
        if (!permissionUnchanged()) {
            stop()
            return
        }
        val provider = location.provider ?: return
        if (
            provider == LocationManager.NETWORK_PROVIDER ||
                (precise && provider == LocationManager.GPS_PROVIDER)
        ) {
            locations[provider] = Location(location)
        }
    }

    override fun onProviderDisabled(provider: String) {
        locations.remove(provider)
    }

    override fun onProviderEnabled(provider: String) = Unit

    @Deprecated("Required on Android 10")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

    private fun permissionUnchanged() =
        if (precise) allowed(context, Manifest.permission.ACCESS_FINE_LOCATION)
        else allowed(context, Manifest.permission.ACCESS_COARSE_LOCATION)

    private fun stop() {
        val registered = listening
        listening = false
        locations.clear()
        if (registered) {
            try {
                manager?.removeUpdates(this)
            } catch (_: SecurityException) {
                return
            }
        }
    }

    companion object {
        private fun allowed(context: Context, permission: String) =
            ContextCompat.checkSelfPermission(context, permission) ==
                PackageManager.PERMISSION_GRANTED
    }
}
