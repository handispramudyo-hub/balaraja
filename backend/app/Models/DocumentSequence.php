<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DocumentSequence extends Model
{
    protected $fillable = [
        'prefix',
        'doc_date',
        'last_number',
    ];

    protected $casts = [
        'doc_date' => 'date',
        'last_number' => 'integer',
    ];
}
