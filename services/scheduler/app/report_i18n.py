"""Labels of the analytics PDF report in en, fr and ar (RTL)."""

from __future__ import annotations

from typing import Final

LOCALES: Final = ("en", "fr", "ar")

LABELS: Final[dict[str, dict[str, str]]] = {
    "en": {
        "title": "Analytics report",
        "period": "Period",
        "generated": "Generated",
        "scope_clinic": "Clinic",
        "scope_organization": "All clinics",
        "vs_previous": "vs previous period",
        "kpi_volume": "Appointments",
        "kpi_noshow": "No-show rate",
        "kpi_wait": "Average wait",
        "kpi_utilisation": "Utilisation",
        "kpi_cancel": "Cancellations",
        "min": "min",
        "pp": "pp",
        "per_day": "per day",
        "volume_by_day": "Appointments per day",
        "wait_trend": "Wait time trend (minutes)",
        "by_specialty": "Appointments by specialty",
        "status": "Status breakdown",
        "doctor_util": "Doctor utilisation",
        "doctor": "Doctor",
        "utilisation": "Utilisation",
        "peak_hours": "Peak hours",
        "no_data": "No data for this period",
        "insights": "Scheduling insights",
        "heatmap": "Demand heatmap (appointments by weekday and hour)",
        "leadtime": "No-show rate by lead time",
        "forecast": "14-day forecast (expected appointments)",
        "recommendations": "Recommendations",
        "rec_none": "No recommendations for this period.",
        "doctors_insight": "Doctor workload",
        "appointments": "Appointments",
        "noshow_short": "No-show",
        "footer": "RI'AYA · confidential",
        "page": "Page",
        "of": "of",
        "subject": "Clinic analytics report (aggregated data, no patient details)",
        "rec_high_noshow": (
            "{weekday} at {hour}:00 has a no-show rate of {rate}% across {count} appointments. "
            "Consider an extra reminder or controlled overbooking for this slot."
        ),
        "rec_peak": "Peak demand: {cells}. Keep full staffing during these slots.",
        "rec_underused": (
            "{name} booked {booked} min against a clinic median of {median} min. "
            "Consider redistributing appointments or opening more slots."
        ),
        "rec_underused_anon": (
            "A doctor booked {booked} min against a clinic median of {median} min. "
            "Consider redistributing appointments or opening more slots."
        ),
    },
    "fr": {
        "title": "Rapport d'analyse",
        "period": "Période",
        "generated": "Généré le",
        "scope_clinic": "Clinique",
        "scope_organization": "Toutes les cliniques",
        "vs_previous": "par rapport à la période précédente",
        "kpi_volume": "Rendez-vous",
        "kpi_noshow": "Taux d'absence",
        "kpi_wait": "Attente moyenne",
        "kpi_utilisation": "Taux d'occupation",
        "kpi_cancel": "Annulations",
        "min": "min",
        "pp": "pt",
        "per_day": "par jour",
        "volume_by_day": "Rendez-vous par jour",
        "wait_trend": "Évolution du temps d'attente (minutes)",
        "by_specialty": "Rendez-vous par spécialité",
        "status": "Répartition par statut",
        "doctor_util": "Occupation des médecins",
        "doctor": "Médecin",
        "utilisation": "Occupation",
        "peak_hours": "Heures de pointe",
        "no_data": "Aucune donnée pour cette période",
        "insights": "Analyses de planification",
        "heatmap": "Carte de la demande (rendez-vous par jour et par heure)",
        "leadtime": "Taux d'absence selon le délai de réservation",
        "forecast": "Prévision sur 14 jours (rendez-vous attendus)",
        "recommendations": "Recommandations",
        "rec_none": "Aucune recommandation pour cette période.",
        "doctors_insight": "Charge des médecins",
        "appointments": "Rendez-vous",
        "noshow_short": "Absences",
        "footer": "RI'AYA · confidentiel",
        "page": "Page",
        "of": "sur",
        "subject": "Rapport d'analyse de la clinique (données agrégées, sans détail patient)",
        "rec_high_noshow": (
            "Le créneau {weekday} à {hour}h00 affiche un taux d'absence de {rate} % "
            "sur {count} rendez-vous. Prévoyez un rappel supplémentaire ou une "
            "surréservation contrôlée."
        ),
        "rec_peak": "Pics de demande : {cells}. Maintenez un effectif complet sur ces créneaux.",
        "rec_underused": (
            "{name} a {booked} min réservées contre une médiane de {median} min dans la "
            "clinique. Envisagez de redistribuer les rendez-vous ou d'ouvrir plus de créneaux."
        ),
        "rec_underused_anon": (
            "Un médecin a {booked} min réservées contre une médiane de {median} min dans la "
            "clinique. Envisagez de redistribuer les rendez-vous ou d'ouvrir plus de créneaux."
        ),
    },
    "ar": {
        "title": "تقرير التحليلات",
        "period": "الفترة",
        "generated": "تاريخ الإنشاء",
        "scope_clinic": "العيادة",
        "scope_organization": "جميع العيادات",
        "vs_previous": "مقارنة بالفترة السابقة",
        "kpi_volume": "المواعيد",
        "kpi_noshow": "نسبة عدم الحضور",
        "kpi_wait": "متوسط الانتظار",
        "kpi_utilisation": "نسبة الإشغال",
        "kpi_cancel": "الإلغاءات",
        "min": "دقيقة",
        "pp": "نقطة",
        "per_day": "في اليوم",
        "volume_by_day": "المواعيد حسب اليوم",
        "wait_trend": "اتجاه وقت الانتظار (بالدقائق)",
        "by_specialty": "المواعيد حسب التخصص",
        "status": "توزيع الحالات",
        "doctor_util": "إشغال الأطباء",
        "doctor": "الطبيب",
        "utilisation": "الإشغال",
        "peak_hours": "ساعات الذروة",
        "no_data": "لا توجد بيانات لهذه الفترة",
        "insights": "تحليلات الجدولة",
        "heatmap": "خريطة الطلب (المواعيد حسب اليوم والساعة)",
        "leadtime": "نسبة عدم الحضور حسب مدة الحجز المسبق",
        "forecast": "توقعات 14 يوماً (المواعيد المتوقعة)",
        "recommendations": "التوصيات",
        "rec_none": "لا توجد توصيات لهذه الفترة.",
        "doctors_insight": "عبء عمل الأطباء",
        "appointments": "المواعيد",
        "noshow_short": "عدم الحضور",
        "footer": "رعاية · سري",
        "page": "صفحة",
        "of": "من",
        "subject": "تقرير تحليلات العيادة (بيانات مجمّعة دون تفاصيل المرضى)",
        "rec_high_noshow": (
            "موعد {weekday} الساعة {hour}:00 سجّل نسبة عدم حضور {rate}% من أصل {count} موعداً. "
            "يُنصح بإرسال تذكير إضافي أو حجز زائد مدروس لهذه الفترة."
        ),
        "rec_peak": "ذروة الطلب: {cells}. حافظ على اكتمال الطاقم في هذه الفترات.",
        "rec_underused": (
            "حجز {name} {booked} دقيقة مقابل وسيط العيادة البالغ {median} دقيقة. "
            "فكّر في إعادة توزيع المواعيد أو فتح فترات أكثر."
        ),
        "rec_underused_anon": (
            "حجز أحد الأطباء {booked} دقيقة مقابل وسيط العيادة البالغ {median} دقيقة. "
            "فكّر في إعادة توزيع المواعيد أو فتح فترات أكثر."
        ),
    },
}

STATUS: Final[dict[str, dict[str, str]]] = {
    "en": {
        "SCHEDULED": "Scheduled",
        "CONFIRMED": "Confirmed",
        "CHECKED_IN": "Checked in",
        "IN_PROGRESS": "In progress",
        "COMPLETED": "Completed",
        "CANCELLED": "Cancelled",
        "NO_SHOW": "No-show",
    },
    "fr": {
        "SCHEDULED": "Planifié",
        "CONFIRMED": "Confirmé",
        "CHECKED_IN": "Enregistré",
        "IN_PROGRESS": "En cours",
        "COMPLETED": "Terminé",
        "CANCELLED": "Annulé",
        "NO_SHOW": "Absent",
    },
    "ar": {
        "SCHEDULED": "مجدول",
        "CONFIRMED": "مؤكد",
        "CHECKED_IN": "تم تسجيل الوصول",
        "IN_PROGRESS": "قيد التنفيذ",
        "COMPLETED": "مكتمل",
        "CANCELLED": "ملغى",
        "NO_SHOW": "لم يحضر",
    },
}

# Monday first (weekday 0 = Monday, as in the insights matrix).
WEEKDAYS: Final[dict[str, list[str]]] = {
    "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    "fr": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    "ar": ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"],
}

MONTHS: Final[dict[str, list[str]]] = {
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "fr": [
        "janv.",
        "févr.",
        "mars",
        "avr.",
        "mai",
        "juin",
        "juil.",
        "août",
        "sept.",
        "oct.",
        "nov.",
        "déc.",
    ],
    "ar": [
        "يناير",
        "فبراير",
        "مارس",
        "أبريل",
        "مايو",
        "يونيو",
        "يوليو",
        "أغسطس",
        "سبتمبر",
        "أكتوبر",
        "نوفمبر",
        "ديسمبر",
    ],
}

LEAD_TIME: Final[dict[str, dict[str, str]]] = {
    "en": {"0-1d": "0-1 days", "2-7d": "2-7 days", "8-30d": "8-30 days", "31d+": "31+ days"},
    "fr": {"0-1d": "0-1 jour", "2-7d": "2-7 jours", "8-30d": "8-30 jours", "31d+": "31 jours et +"},
    "ar": {"0-1d": "0-1 يوم", "2-7d": "2-7 أيام", "8-30d": "8-30 يوماً", "31d+": "31 يوماً فأكثر"},
}
