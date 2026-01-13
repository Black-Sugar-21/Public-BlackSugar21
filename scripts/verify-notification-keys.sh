#!/bin/bash

# Script de verificación de keys de notificación multiidioma
# Verifica que todas las keys necesarias existan en Android e iOS

echo "🔍 VERIFICACIÓN DE KEYS DE NOTIFICACIÓN MULTIIDIOMA"
echo "===================================================="
echo ""

# Keys requeridas
ANDROID_KEYS=(
  "notification_new_match_title"
  "notification_new_match_body"
  "notification_new_message_title"
)

IOS_KEYS=(
  "notification-new-match-title"
  "notification-new-match-body"
  "notification-new-message-title"
)

# Idiomas soportados
ANDROID_LANGS=("" "es" "pt" "fr" "de" "ru" "ja" "ar" "in" "zh")
IOS_LANGS=("en" "es" "pt" "fr" "de" "ru" "ja" "ar" "id" "zh-Hans")

ANDROID_BASE="/Users/daniel/AndroidStudioProjects/BlackSugar212/app/src/main/res"
IOS_BASE="/Users/daniel/AndroidStudioProjects/iOS/black-sugar-21"

errors=0

echo "📱 ANDROID"
echo "----------"
for lang in "${ANDROID_LANGS[@]}"; do
  if [ -z "$lang" ]; then
    dir="values"
    display="en (default)"
  else
    dir="values-$lang"
    display="$lang"
  fi
  
  file="$ANDROID_BASE/$dir/strings.xml"
  
  if [ ! -f "$file" ]; then
    echo "❌ $display: Archivo no encontrado"
    ((errors++))
    continue
  fi
  
  missing_keys=0
  for key in "${ANDROID_KEYS[@]}"; do
    if ! grep -q "name=\"$key\"" "$file"; then
      if [ $missing_keys -eq 0 ]; then
        echo "⚠️  $display: Faltan keys:"
      fi
      echo "   - $key"
      ((missing_keys++))
      ((errors++))
    fi
  done
  
  if [ $missing_keys -eq 0 ]; then
    echo "✅ $display: Todas las keys presentes"
  fi
done

echo ""
echo "🍎 iOS"
echo "------"
for lang in "${IOS_LANGS[@]}"; do
  file="$IOS_BASE/$lang.lproj/Localizable.strings"
  
  if [ ! -f "$file" ]; then
    echo "❌ $lang: Archivo no encontrado"
    ((errors++))
    continue
  fi
  
  missing_keys=0
  for key in "${IOS_KEYS[@]}"; do
    if ! grep -q "\"$key\"" "$file"; then
      if [ $missing_keys -eq 0 ]; then
        echo "⚠️  $lang: Faltan keys:"
      fi
      echo "   - $key"
      ((missing_keys++))
      ((errors++))
    fi
  done
  
  if [ $missing_keys -eq 0 ]; then
    echo "✅ $lang: Todas las keys presentes"
  fi
done

echo ""
echo "===================================================="
if [ $errors -eq 0 ]; then
  echo "✅ VERIFICACIÓN EXITOSA: Todas las keys están presentes"
  exit 0
else
  echo "❌ ERRORES ENCONTRADOS: $errors keys faltantes"
  exit 1
fi
