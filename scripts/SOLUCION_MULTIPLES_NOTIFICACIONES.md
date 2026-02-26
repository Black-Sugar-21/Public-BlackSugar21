# 🔍 SOLUCIÓN: Múltiples Notificaciones en MainTabView

## 📊 PROBLEMA IDENTIFICADO

`MainTabView` recibe la notificación `OpenMessagesTab` **3 veces** porque:

```swift
.onAppear {
    // ❌ PROBLEMA: Se registra el observer cada vez que aparece
    NotificationCenter.default.addObserver(
        forName: NSNotification.Name("OpenMessagesTab"),
        object: nil,
        queue: .main
    ) { _ in
        print("[🔔 MainTabView] Recibida notificación para abrir tab de mensajes")
        selectedTab = 1
    }
}
.onDisappear {
    matchListViewModel.stopListeningToMatches()
    // ❌ PROBLEMA: NO se eliminan los observers registrados
}
```

### ¿Por qué se dispara 3 veces?

1. **Primera aparición**: MainTabView se carga → registra observer #1
2. **Segunda aparición**: Usuario navega fuera y vuelve → registra observer #2
3. **Tercera aparición**: Usuario navega fuera y vuelve de nuevo → registra observer #3

Ahora hay **3 observers** registrados para la misma notificación → se ejecuta 3 veces.

---

## ✅ SOLUCIÓN 1: Usar `.onReceive()` (RECOMENDADA)

SwiftUI maneja automáticamente el ciclo de vida:

```swift
struct MainTabView: View {
    @State private var selectedTab = 0
    @StateObject private var matchListViewModel = MatchListViewModel()
    @StateObject private var homeViewModel = HomeViewModel()
    @State private var showMatchView = false

    var body: some View {
        ZStack {
            TabView(selection: $selectedTab) {
                // ... tabs ...
            }
        }
        .environmentObject(matchListViewModel)
        .onAppear {
            print("🚀 [MainTabView] Vista principal apareció")
        }
        .onDisappear {
            matchListViewModel.stopListeningToMatches()
        }
        // ✅ SOLUCIÓN: Usar onReceive en lugar de addObserver
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("OpenHomeTab"))) { _ in
            print("[🔔 MainTabView] Recibida notificación para abrir tab de Home")
            selectedTab = 0
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("OpenMessagesTab"))) { _ in
            print("[🔔 MainTabView] Recibida notificación para abrir tab de mensajes")
            selectedTab = 1
        }
        .accentColor(AppColor.secondaryAccentColor)
        // ... resto del código ...
    }
}
```

### Ventajas:
- ✅ SwiftUI gestiona automáticamente el ciclo de vida
- ✅ Se registra/desregistra automáticamente con la vista
- ✅ No hay fugas de memoria
- ✅ Código más limpio y idiomático

---

## ✅ SOLUCIÓN 2: Eliminar observers manualmente

Si prefieres mantener `addObserver()`:

```swift
struct MainTabView: View {
    @State private var selectedTab = 0
    @StateObject private var matchListViewModel = MatchListViewModel()
    @StateObject private var homeViewModel = HomeViewModel()
    @State private var showMatchView = false
    
    // Variables para almacenar las referencias
    private var homeTabObserver: NSObjectProtocol?
    private var messagesTabObserver: NSObjectProtocol?

    var body: some View {
        ZStack {
            TabView(selection: $selectedTab) {
                // ... tabs ...
            }
        }
        .environmentObject(matchListViewModel)
        .onAppear {
            print("🚀 [MainTabView] Vista principal apareció")
            
            // Registrar observers y guardar referencias
            homeTabObserver = NotificationCenter.default.addObserver(
                forName: NSNotification.Name("OpenHomeTab"),
                object: nil,
                queue: .main
            ) { _ in
                print("[🔔 MainTabView] Recibida notificación para abrir tab de Home")
                selectedTab = 0
            }

            messagesTabObserver = NotificationCenter.default.addObserver(
                forName: NSNotification.Name("OpenMessagesTab"),
                object: nil,
                queue: .main
            ) { _ in
                print("[🔔 MainTabView] Recibida notificación para abrir tab de mensajes")
                selectedTab = 1
            }
        }
        .onDisappear {
            matchListViewModel.stopListeningToMatches()
            
            // ✅ Eliminar observers cuando desaparece la vista
            if let observer = homeTabObserver {
                NotificationCenter.default.removeObserver(observer)
            }
            if let observer = messagesTabObserver {
                NotificationCenter.default.removeObserver(observer)
            }
        }
        .accentColor(AppColor.secondaryAccentColor)
        // ... resto del código ...
    }
}
```

### Desventajas:
- ❌ Más código (gestión manual)
- ❌ Fácil olvidar eliminar observers
- ❌ Puede causar fugas de memoria

---

## 📋 COMPARACIÓN

| Aspecto | `.onReceive()` | `addObserver()` + `removeObserver()` |
|---------|---------------|-------------------------------------|
| Gestión | Automática | Manual |
| Código | Menos líneas | Más líneas |
| Fugas | Imposible | Posible si no se elimina |
| Idiomático | SwiftUI nativo | UIKit style |
| Recomendación | ✅ **SÍ** | ⚠️ Solo si es necesario |

---

## 🎯 RECOMENDACIÓN

**Usar Solución 1**: `.onReceive()` es el enfoque idiomático en SwiftUI y previene automáticamente este tipo de bugs.

---

## 🧪 VERIFICACIÓN

Después de aplicar la solución, los logs deberían mostrar:

```
✅ ANTES (Problema):
[🔔 MainTabView] Recibida notificación para abrir tab de mensajes
[🔔 MainTabView] Recibida notificación para abrir tab de mensajes
[🔔 MainTabView] Recibida notificación para abrir tab de mensajes

✅ DESPUÉS (Solucionado):
[🔔 MainTabView] Recibida notificación para abrir tab de mensajes
```

Solo 1 mensaje, indicando que el observer se disparó una sola vez.

---

## 📝 ARCHIVO A MODIFICAR

- **Archivo**: `iOS/black-sugar-21/ui/app/ContentView.swift`
- **Líneas**: 107-137 (reemplazar `onAppear` con `.onReceive()`)

---

## ⚡ IMPACTO

- **Funcionalidad**: NO cambia, solo optimiza
- **Performance**: Mejora (menos observers duplicados)
- **Código**: Más limpio y mantenible
- **Testing**: Sin cambios necesarios
