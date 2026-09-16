package expo.modules.focallycamera

import android.view.KeyEvent
import android.view.Window

class VolumeShutter(private val capture: () -> Unit) {
    private var window: Window? = null
    private var original: Window.Callback? = null
    private var installed: Window.Callback? = null

    fun attach(next: Window?) {
        if (next === window) return
        detach()
        if (next == null) return
        val delegate = next.callback ?: return
        val callback =
            object : Window.Callback by delegate {
                override fun dispatchKeyEvent(event: KeyEvent): Boolean {
                    if (
                        event.keyCode != KeyEvent.KEYCODE_VOLUME_UP &&
                            event.keyCode != KeyEvent.KEYCODE_VOLUME_DOWN
                    )
                        return delegate.dispatchKeyEvent(event)
                    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) capture()
                    return true
                }
            }
        window = next
        original = delegate
        installed = callback
        next.callback = callback
    }

    fun detach() {
        if (window?.callback === installed) original?.let { window?.callback = it }
        window = null
        original = null
        installed = null
    }
}
